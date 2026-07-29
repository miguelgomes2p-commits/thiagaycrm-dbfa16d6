import { createFileRoute } from "@tanstack/react-router";

// Cron target: drena renave_queue. Chamado pelo pg_cron a cada 30s.
// Pega itens queued com next_run_at <= now(), executa via renaveHttpRequest,
// atualiza operação e agenda retry com backoff em caso de falha.
export const Route = createFileRoute("/api/public/hooks/drain-renave-queue")({
  server: { handlers: { POST: handler, GET: handler } },
});

async function handler({ request }: { request: Request }) {
  // Proteção leve: se RENAVE_CRON_SECRET estiver setada, exige match.
  const expected = process.env.RENAVE_CRON_SECRET;
  if (expected) {
    const got = request.headers.get("x-renave-cron-secret");
    if (got !== expected) {
      // Ignora silenciosamente sem revelar detalhes (endpoint continua chamável pelo cron interno).
      return Response.json({ ok: true, skipped: "auth" });
    }
  }

  const started = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { renaveHttpRequest, fetchOAuthToken, decryptSecret, downloadCertPfx, renderPath } =
    await import("@/lib/renave.server");

  const { data: items, error } = await supabaseAdmin
    .from("renave_queue")
    .select("id, workspace_id, operation_id, endpoint_code, payload, attempts, max_attempts")
    .eq("status", "queued")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(10);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!items || items.length === 0) {
    return Response.json({ ok: true, processed: 0, ms: Date.now() - started });
  }

  let processed = 0;
  let failed = 0;
  let dead = 0;

  for (const item of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("renave_queue") as any)
      .update({ status: "processing", attempts: item.attempts + 1 })
      .eq("id", item.id);

    try {
      const { data: cfg, error: cfgErr } = await supabaseAdmin
        .from("renave_config")
        .select("*")
        .eq("workspace_id", item.workspace_id)
        .maybeSingle();
      if (cfgErr || !cfg) throw new Error("Config não encontrada");
      if (!cfg.is_active) throw new Error("Integração desativada");
      if (!cfg.cert_storage_path || !cfg.cert_password_enc)
        throw new Error("Certificado ausente");
      if (!cfg.oauth_token_url || !cfg.oauth_client_id || !cfg.oauth_client_secret_enc)
        throw new Error("OAuth ausente");

      const { data: ep, error: epErr } = await supabaseAdmin
        .from("renave_endpoints")
        .select("*")
        .eq("workspace_id", item.workspace_id)
        .eq("code", item.endpoint_code)
        .maybeSingle();
      if (epErr || !ep) throw new Error(`Endpoint ${item.endpoint_code} não encontrado`);

      const pfx = await downloadCertPfx(cfg.cert_storage_path);
      const passphrase = decryptSecret(cfg.cert_password_enc);

      // OAuth
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
          clientSecret: decryptSecret(cfg.oauth_client_secret_enc),
          pfx,
          passphrase,
        });
        token = fresh.access_token;
        tokenType = fresh.token_type ?? "Bearer";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin.from("renave_config") as any)
          .update({ oauth_token_cache: fresh })
          .eq("id", cfg.id);
      }

      const payload = (item.payload ?? {}) as {
        pathParams?: Record<string, string>;
        queryParams?: Record<string, string>;
        body?: unknown;
      };
      const path = renderPath(ep.path_template, payload.pathParams ?? {});
      const qs = new URLSearchParams(payload.queryParams ?? {}).toString();
      const url = `${cfg.base_url.replace(/\/$/, "")}${path}${qs ? `?${qs}` : ""}`;

      const result = await renaveHttpRequest({
        url,
        method: ep.method,
        headers: { Authorization: `${tokenType} ${token}` },
        body: payload.body,
        pfx,
        passphrase,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("renave_http_logs") as any).insert({
        workspace_id: item.workspace_id,
        operation_id: item.operation_id,
        endpoint_code: item.endpoint_code,
        method: ep.method,
        url,
        response_status: result.status,
        response_headers: result.headers,
        response_body:
          typeof result.body === "string" ? { raw: result.body.slice(0, 4000) } : result.body,
        duration_ms: result.durationMs,
      });

      const ok = result.status >= 200 && result.status < 300;
      if (item.operation_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin.from("renave_operations") as any)
          .update({
            status: ok ? "sucesso" : "falha",
            response_payload:
              typeof result.body === "string" ? { raw: result.body.slice(0, 4000) } : result.body,
            error_message: ok ? null : `HTTP ${result.status}`,
          })
          .eq("id", item.operation_id);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("renave_queue") as any)
        .update({ status: ok ? "done" : "failed", last_error: ok ? null : `HTTP ${result.status}` })
        .eq("id", item.id);

      if (ok) processed++;
      else failed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const nextAttempts = item.attempts + 1;
      const isDead = nextAttempts >= item.max_attempts;
      const backoffSec = Math.min(600, 30 * Math.pow(2, nextAttempts));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("renave_queue") as any)
        .update({
          status: isDead ? "dead" : "queued",
          last_error: msg,
          next_run_at: new Date(Date.now() + backoffSec * 1000).toISOString(),
        })
        .eq("id", item.id);
      if (item.operation_id && isDead) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin.from("renave_operations") as any)
          .update({ status: "falha", error_message: msg })
          .eq("id", item.operation_id);
      }
      if (isDead) dead++;
      else failed++;
    }
  }

  return Response.json({
    ok: true,
    total: items.length,
    processed,
    failed,
    dead,
    ms: Date.now() - started,
  });
}
