// Client-safe module. Server-only code lives in renave.server.ts and is loaded
// inside handlers via dynamic import.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================================
// SET CREDENTIALS (senha do .p12 + client_secret OAuth cifrados no servidor)
// ============================================================================

export const setRenaveCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        certPassword: z.string().optional(),
        oauthClientId: z.string().optional(),
        oauthClientSecret: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./renave.server");

    const { data: cfg, error: cfgErr } = await context.supabase
      .from("renave_config")
      .select("id, workspace_id")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    if (!cfg) throw new Error("Config do RENAVE ainda não existe. Salve as configurações primeiro.");

    const patch: Record<string, string | null> = {};
    if (data.certPassword !== undefined) {
      patch.cert_password_enc = data.certPassword ? encryptSecret(data.certPassword) : null;
    }
    if (data.oauthClientId !== undefined) {
      patch.oauth_client_id = data.oauthClientId || null;
    }
    if (data.oauthClientSecret !== undefined) {
      patch.oauth_client_secret_enc = data.oauthClientSecret
        ? encryptSecret(data.oauthClientSecret)
        : null;
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin
      .from("renave_config")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", cfg.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// EXECUTAR ENDPOINT (chamada real ao SERPRO via mTLS + OAuth)
// ============================================================================

export const executeRenaveEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        endpointCode: z.string().min(1),
        vehicleId: z.string().uuid().optional(),
        operationType: z
          .enum(["entrada", "saida", "consulta_atpv", "consulta_crlve", "pdf_atpv", "nfe", "outra"])
          .default("outra"),
        pathParams: z.record(z.string(), z.string()).default({}),
        queryParams: z.record(z.string(), z.string()).default({}),
        body: z.unknown().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderPath, renaveHttpRequest, fetchOAuthToken, decryptSecret, downloadCertPfx } =
      await import("./renave.server");

    // 1) autoriza (member basta para consultar; admin para operar entrada/saída)
    const { data: cfg, error: cfgErr } = await context.supabase
      .from("renave_config")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    if (!cfg) throw new Error("RENAVE ainda não configurado neste workspace.");
    if (!cfg.is_active) throw new Error("Integração RENAVE está desativada. Ative em Config.");

    // 2) carrega endpoint
    const { data: ep, error: epErr } = await context.supabase
      .from("renave_endpoints")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("code", data.endpointCode)
      .maybeSingle();
    if (epErr) throw new Error(epErr.message);
    if (!ep) throw new Error(`Endpoint '${data.endpointCode}' não encontrado.`);
    if (!ep.is_enabled) throw new Error(`Endpoint '${data.endpointCode}' está desativado.`);

    // 3) valida credenciais
    if (!cfg.cert_storage_path) throw new Error("Certificado .p12 não enviado.");
    if (!cfg.oauth_token_url) throw new Error("URL do OAuth token não configurada.");
    if (!cfg.oauth_client_id || !cfg.oauth_client_secret_enc)
      throw new Error("Credenciais OAuth (client_id/secret) não configuradas.");
    if (!cfg.cert_password_enc) throw new Error("Senha do certificado .p12 não configurada.");

    const pfx = await downloadCertPfx(cfg.cert_storage_path);
    const passphrase = decryptSecret(cfg.cert_password_enc);
    const clientSecret = decryptSecret(cfg.oauth_client_secret_enc);

    // 4) cria operação
    const { data: op, error: opErr } = await supabaseAdmin
      .from("renave_operations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        workspace_id: data.workspaceId,
        vehicle_id: data.vehicleId ?? null,
        operation_type: data.operationType,
        endpoint_code: data.endpointCode,
        status: "em_andamento",
        request_payload: {
          pathParams: data.pathParams,
          queryParams: data.queryParams,
          body: (data.body ?? null) as unknown,
        },
        created_by: context.userId,
      } as any)
      .select("id")
      .single();
    if (opErr) throw new Error(opErr.message);


    try {
      // 5) OAuth token (cache em renave_config.oauth_token_cache)
      const cache = (cfg.oauth_token_cache ?? {}) as {
        access_token?: string;
        expires_at?: number;
        token_type?: string;
      };
      let token = cache.access_token;
      let tokenType = cache.token_type ?? "Bearer";
      if (!token || !cache.expires_at || cache.expires_at <= Date.now()) {
        const fresh = await fetchOAuthToken({
          oauthUrl: cfg.oauth_token_url,
          clientId: cfg.oauth_client_id,
          clientSecret,
          pfx,
          passphrase,
        });
        token = fresh.access_token;
        tokenType = fresh.token_type ?? "Bearer";
        await supabaseAdmin
          .from("renave_config")
          .update({ oauth_token_cache: fresh })
          .eq("id", cfg.id);
      }

      // 6) monta URL
      const path = renderPath(ep.path_template, data.pathParams);
      const qs = new URLSearchParams(data.queryParams).toString();
      const url = `${cfg.base_url.replace(/\/$/, "")}${path}${qs ? `?${qs}` : ""}`;

      // 7) chamada mTLS
      const result = await renaveHttpRequest({
        url,
        method: ep.method,
        headers: {
          Authorization: `${tokenType} ${token}`,
          ...(ep.headers as Record<string, string> | null ?? {}),
        },
        body: data.body,
        pfx,
        passphrase,
      });

      // 8) log HTTP
      const epHeaders = (ep.headers ?? {}) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabaseAdmin.from("renave_http_logs").insert({
        workspace_id: data.workspaceId,
        operation_id: op.id,
        endpoint_code: data.endpointCode,
        method: ep.method,
        url,
        request_headers: { Authorization: "***", ...epHeaders },
        request_body: (data.body ?? null) as unknown,
        response_status: result.status,
        response_headers: result.headers,
        response_body:
          typeof result.body === "string" ? { raw: result.body.slice(0, 4000) } : result.body,
        duration_ms: result.durationMs,
      } as any);

      const ok = result.status >= 200 && result.status < 300;
      await supabaseAdmin
        .from("renave_operations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          status: ok ? "sucesso" : "falha",
          response_payload:
            typeof result.body === "string" ? { raw: result.body.slice(0, 4000) } : result.body,
          error_message: ok ? null : `HTTP ${result.status}: ${result.bodyText.slice(0, 300)}`,
        } as any)
        .eq("id", op.id);

      return {
        ok,
        operationId: op.id as string,
        status: result.status,
        body: JSON.stringify(result.body ?? null),
      };


    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("renave_operations")
        .update({ status: "falha", error_message: msg })
        .eq("id", op.id);
      throw new Error(msg);
    }
  });

// ============================================================================
// TESTAR CONEXÃO (OAuth apenas — valida cert + credenciais)
// ============================================================================

export const testRenaveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { fetchOAuthToken, decryptSecret, downloadCertPfx } = await import("./renave.server");
    const { data: cfg, error } = await context.supabase
      .from("renave_config")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cfg) throw new Error("Config não encontrada.");
    if (!cfg.cert_storage_path || !cfg.cert_password_enc)
      throw new Error("Certificado ou senha ausentes.");
    if (!cfg.oauth_token_url || !cfg.oauth_client_id || !cfg.oauth_client_secret_enc)
      throw new Error("Credenciais OAuth ausentes.");

    const pfx = await downloadCertPfx(cfg.cert_storage_path);
    try {
      const tok = await fetchOAuthToken({
        oauthUrl: cfg.oauth_token_url,
        clientId: cfg.oauth_client_id,
        clientSecret: decryptSecret(cfg.oauth_client_secret_enc),
        pfx,
        passphrase: decryptSecret(cfg.cert_password_enc),
      });
      return {
        ok: true,
        expiresAt: tok.expires_at,
        tokenType: tok.token_type,
        preview: tok.access_token.slice(0, 12) + "…",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  });

// ============================================================================
// REPROCESSAR OPERAÇÃO (re-enfileira uma operação falha)
// ============================================================================

export const retryRenaveOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ operationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: op, error } = await context.supabase
      .from("renave_operations")
      .select("id, workspace_id, endpoint_code, request_payload")
      .eq("id", data.operationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!op) throw new Error("Operação não encontrada.");
    if (!op.endpoint_code) throw new Error("Operação sem endpoint_code.");

    const { error: qErr } = await supabaseAdmin.from("renave_queue").insert({
      workspace_id: op.workspace_id,
      operation_id: op.id,
      endpoint_code: op.endpoint_code,
      payload: op.request_payload ?? {},
      status: "queued",
      next_run_at: new Date().toISOString(),
    });
    if (qErr) throw new Error(qErr.message);

    await supabaseAdmin
      .from("renave_operations")
      .update({ status: "pendente", error_message: null })
      .eq("id", op.id);

    return { ok: true };
  });
