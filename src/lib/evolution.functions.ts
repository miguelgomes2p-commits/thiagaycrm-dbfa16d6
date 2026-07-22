import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Grava um erro da Evolution no banco (para debug posterior).
// Nunca falha silenciosamente é OK — logging é best-effort.
async function logEvolutionError(params: {
  workspaceId?: string | null;
  whatsappNumberId?: string | null;
  operation: string;
  baseUrl?: string | null;
  instanceName?: string | null;
  error: unknown;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const e = params.error as {
      status?: number;
      bodyText?: string;
      url?: string;
      method?: string;
      requestBody?: unknown;
      message?: string;
      friendlyMessage?: string;
    };
    const isEvoErr = typeof e?.status === "number" && typeof e?.url === "string";
    await supabaseAdmin.from("evolution_error_logs").insert({
      workspace_id: params.workspaceId ?? null,
      whatsapp_number_id: params.whatsappNumberId ?? null,
      operation: params.operation,
      method: isEvoErr ? e.method ?? null : null,
      url: isEvoErr ? e.url ?? null : null,
      status: isEvoErr ? e.status ?? null : null,
      request_body: isEvoErr && e.requestBody !== undefined
        ? (e.requestBody as never)
        : null,
      response_body: isEvoErr ? e.bodyText ?? null : null,
      error_message: e?.friendlyMessage ?? e?.message ?? String(params.error),
      base_url: params.baseUrl ?? null,
      instance_name: params.instanceName ?? null,
    });
  } catch (err) {
    console.error("[evolution] failed to log error:", err);
  }
}

function evolutionWebhookUrl(origin: string, whatsappNumberId: string) {
  return `${origin.replace(/\/+$/, "")}/api/public/webhooks/evolution/${whatsappNumberId}`;
}

/**
 * Cria e conecta uma instância na Evolution API, salvando o número aqui e
 * retornando o QR Code para escaneamento com o app oficial do WhatsApp.
 */
export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        label: z.string().min(1).max(80),
        displayNumber: z.string().min(6),
        baseUrl: z.string().url(),
        apiKey: z.string().min(6),
        instanceName: z
          .string()
          .min(3)
          .max(60)
          .regex(/^[a-zA-Z0-9_-]+$/, "Use apenas letras, números, _ ou -"),
        webhookOrigin: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const baseUrl = data.baseUrl.replace(/\/+$/, "");

    // 1) Cria o registro local primeiro para termos o ID (usado no webhook)
    const { data: inserted, error } = await context.supabase
      .from("whatsapp_numbers")
      .insert({
        workspace_id: data.workspaceId,
        label: data.label,
        display_number: data.displayNumber,
        provider: "evolution",
        provider_base_url: baseUrl,
        provider_api_key: data.apiKey,
        instance_name: data.instanceName,
        connection_status: "connecting",
        default_owner_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const webhookUrl = `${data.webhookOrigin.replace(/\/+$/, "")}/api/public/webhooks/evolution/${inserted.id}`;

    const { evolutionCreateInstance, evolutionConnect, evolutionSetWebhook } = await import("@/lib/evolution.server");

    // 2) Cria a instância na Evolution. Se já existir (403/409), tenta reaproveitar
    //    conectando na instância existente e ajustando o webhook.
    try {
      const created = await evolutionCreateInstance(baseUrl, data.apiKey, data.instanceName, webhookUrl);
      await evolutionSetWebhook(baseUrl, data.apiKey, data.instanceName, webhookUrl).catch((webhookError) =>
        logEvolutionError({
          workspaceId: data.workspaceId,
          whatsappNumberId: inserted.id,
          operation: "createInstance.setWebhook",
          baseUrl,
          instanceName: data.instanceName,
          error: webhookError,
        }),
      );
      const qr = created.qrcode?.base64 ?? null;
      await context.supabase
        .from("whatsapp_numbers")
        .update({
          connection_status: qr ? "qr" : "connecting",
          last_qr: qr,
          last_qr_at: qr ? new Date().toISOString() : null,
        })
        .eq("id", inserted.id);
      return { id: inserted.id, qr, webhookUrl };
    } catch (e) {
      const err = e as { status?: number; friendlyMessage?: string; message?: string };
      const msg = (err?.friendlyMessage ?? err?.message ?? "").toLowerCase();
      const alreadyExists =
        (err?.status === 403 || err?.status === 409) &&
        (msg.includes("already") || msg.includes("in use") || msg.includes("exist"));

      if (alreadyExists) {
        // Tenta reaproveitar a instância existente: reconecta + reconfigura webhook.
        try {
          await evolutionSetWebhook(baseUrl, data.apiKey, data.instanceName, webhookUrl).catch(() => undefined);
          const r = await evolutionConnect(baseUrl, data.apiKey, data.instanceName);
          const qr = r.base64 ?? null;
          await context.supabase
            .from("whatsapp_numbers")
            .update({
              connection_status: qr ? "qr" : "connecting",
              last_qr: qr,
              last_qr_at: qr ? new Date().toISOString() : null,
            })
            .eq("id", inserted.id);
          return { id: inserted.id, qr, webhookUrl };
        } catch (e2) {
          await logEvolutionError({
            workspaceId: data.workspaceId,
            whatsappNumberId: inserted.id,
            operation: "createInstance.recoverExisting",
            baseUrl,
            instanceName: data.instanceName,
            error: e2,
          });
          await context.supabase.from("whatsapp_numbers").delete().eq("id", inserted.id);
          const e2msg = (e2 as Error)?.message ?? String(e2);
          throw new Error(`Instância "${data.instanceName}" já existe e não foi possível reconectar: ${e2msg}`);
        }
      }

      await logEvolutionError({
        workspaceId: data.workspaceId,
        whatsappNumberId: inserted.id,
        operation: "createInstance",
        baseUrl,
        instanceName: data.instanceName,
        error: e,
      });
      await context.supabase.from("whatsapp_numbers").delete().eq("id", inserted.id);
      throw new Error(err?.friendlyMessage ?? err?.message ?? String(e));
    }
  });

/**
 * Retorna o QR atual (força reconexão se a instância caiu).
 */
export const refreshEvolutionQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }

    try {
      const { evolutionConnect } = await import("@/lib/evolution.server");
      const r = await evolutionConnect(num.provider_base_url, num.provider_api_key, num.instance_name);
      const qr = r.base64 ?? null;
      await context.supabase
        .from("whatsapp_numbers")
        .update({
          connection_status: qr ? "qr" : "connecting",
          last_qr: qr,
          last_qr_at: qr ? new Date().toISOString() : null,
        })
        .eq("id", data.id);
      return { qr, pairingCode: r.pairingCode ?? null };
    } catch (e) {
      await logEvolutionError({
        workspaceId: num.workspace_id,
        whatsappNumberId: data.id,
        operation: "refreshQr",
        baseUrl: num.provider_base_url,
        instanceName: num.instance_name,
        error: e,
      });
      throw new Error((e as Error)?.message ?? String(e));
    }
  });

/**
 * Consulta o estado da conexão diretamente na Evolution.
 */
export const checkEvolutionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), webhookOrigin: z.string().url().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }
    try {
      const { evolutionConnectionState, evolutionSetWebhook } = await import("@/lib/evolution.server");
      let webhookUpdated = false;
      if (data.webhookOrigin) {
        try {
          await evolutionSetWebhook(num.provider_base_url, num.provider_api_key, num.instance_name, evolutionWebhookUrl(data.webhookOrigin, data.id));
          webhookUpdated = true;
        } catch (webhookError) {
          await logEvolutionError({
            workspaceId: num.workspace_id,
            whatsappNumberId: data.id,
            operation: "checkStatus.setWebhook",
            baseUrl: num.provider_base_url,
            instanceName: num.instance_name,
            error: webhookError,
          });
        }
      }
      const s = await evolutionConnectionState(num.provider_base_url, num.provider_api_key, num.instance_name);
      const state = s.instance?.state ?? "close";
      const mapped =
        state === "open" ? "connected" : state === "connecting" ? "connecting" : state === "close" ? "disconnected" : "error";
      await context.supabase.from("whatsapp_numbers").update({ connection_status: mapped }).eq("id", data.id);
      return { state, mapped, webhookUpdated };
    } catch (e) {
      await logEvolutionError({
        workspaceId: num.workspace_id,
        whatsappNumberId: data.id,
        operation: "checkStatus",
        baseUrl: num.provider_base_url,
        instanceName: num.instance_name,
        error: e,
      });
      throw new Error((e as Error)?.message ?? String(e));
    }
  });

/**
 * Reaponta o webhook da Evolution para a URL pública desta versão do app.
 * Útil quando a instância foi criada em preview/publicação diferente.
 */
export const syncEvolutionWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), webhookOrigin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }
    const webhookUrl = evolutionWebhookUrl(data.webhookOrigin, data.id);
    try {
      const { evolutionSetWebhook } = await import("@/lib/evolution.server");
      await evolutionSetWebhook(num.provider_base_url, num.provider_api_key, num.instance_name, webhookUrl);
      return { ok: true, webhookUrl };
    } catch (e) {
      await logEvolutionError({
        workspaceId: num.workspace_id,
        whatsappNumberId: data.id,
        operation: "syncWebhook",
        baseUrl: num.provider_base_url,
        instanceName: num.instance_name,
        error: e,
      });
      throw new Error((e as { friendlyMessage?: string; message?: string })?.friendlyMessage ?? (e as Error)?.message ?? String(e));
    }
  });

export const syncEvolutionMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), webhookOrigin: z.string().url(), limit: z.number().int().positive().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }

    const webhookUrl = evolutionWebhookUrl(data.webhookOrigin, data.id);
    try {
      const { evolutionFindMessages, evolutionSetWebhook } = await import("@/lib/evolution.server");
      await evolutionSetWebhook(num.provider_base_url, num.provider_api_key, num.instance_name, webhookUrl).catch((webhookError) =>
        logEvolutionError({
          workspaceId: num.workspace_id,
          whatsappNumberId: data.id,
          operation: "syncMessages.setWebhook",
          baseUrl: num.provider_base_url,
          instanceName: num.instance_name,
          error: webhookError,
        }),
      );
      const sevenDaysAgoSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
      const payload = await evolutionFindMessages(num.provider_base_url, num.provider_api_key, num.instance_name, data.limit ?? 100, sevenDaysAgoSec);
      const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
      const stats = await processEvolutionPayload(data.id, { event: "MESSAGES_SET", data: payload }, { source: "manualSync" });
      return { ok: true, stats };
    } catch (e) {
      await logEvolutionError({
        workspaceId: num.workspace_id,
        whatsappNumberId: data.id,
        operation: "syncMessages",
        baseUrl: num.provider_base_url,
        instanceName: num.instance_name,
        error: e,
      });
      throw new Error((e as { friendlyMessage?: string; message?: string })?.friendlyMessage ?? (e as Error)?.message ?? String(e));
    }
  });

export const syncWorkspaceEvolutionMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), webhookOrigin: z.string().url(), limit: z.number().int().positive().max(100).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: numbers, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, workspace_id, provider, provider_base_url, provider_api_key, instance_name, connection_status")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "evolution")
      .eq("is_active", true)
      .not("provider_base_url", "is", null)
      .not("provider_api_key", "is", null)
      .not("instance_name", "is", null);
    if (error) throw new Error(error.message);

    const { evolutionFindMessages } = await import("@/lib/evolution.server");
    const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");

    const results: Array<{ id: string; ok: boolean; insertedMessages?: number; rowsSeen?: number; error?: string }> = [];
    for (const num of numbers ?? []) {
      try {
        // NOTE: setWebhook removido daqui — era chamado a cada 60s por cliente conectado,
        // recarregando listeners internos da Evolution e causando pressão de memória.
        // Webhook é configurado apenas: (1) ao criar instância, (2) no botão "Sincronizar" manual.
        const sevenDaysAgoSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
        const payload = await evolutionFindMessages(num.provider_base_url!, num.provider_api_key!, num.instance_name!, data.limit ?? 50, sevenDaysAgoSec);
        const stats = await processEvolutionPayload(num.id, { event: "MESSAGES_SET", data: payload }, { source: "workspaceAutoSync" });
        results.push({ id: num.id, ok: true, insertedMessages: stats.insertedMessages, rowsSeen: stats.rowsSeen });

      } catch (e) {
        await logEvolutionError({
          workspaceId: data.workspaceId,
          whatsappNumberId: num.id,
          operation: "workspaceSync",
          baseUrl: num.provider_base_url,
          instanceName: num.instance_name,
          error: e,
        });
        results.push({ id: num.id, ok: false, error: (e as { friendlyMessage?: string; message?: string })?.friendlyMessage ?? (e as Error)?.message ?? String(e) });
      }
    }
    return { ok: true, results };
  });

/**
 * Faz logout na Evolution (mantém a instância). Usuário precisará escanear QR de novo.
 */
export const logoutEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }
    try {
      const { evolutionLogout } = await import("@/lib/evolution.server");
      await evolutionLogout(num.provider_base_url, num.provider_api_key, num.instance_name);
      await context.supabase
        .from("whatsapp_numbers")
        .update({ connection_status: "disconnected", last_qr: null, last_qr_at: null })
        .eq("id", data.id);
      return { ok: true };
    } catch (e) {
      await logEvolutionError({
        workspaceId: num.workspace_id,
        whatsappNumberId: data.id,
        operation: "logout",
        baseUrl: num.provider_base_url,
        instanceName: num.instance_name,
        error: e,
      });
      throw new Error((e as Error)?.message ?? String(e));
    }
  });

/**
 * Lista os últimos erros da Evolution para um workspace (para diagnóstico).
 */
export const listEvolutionErrorLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ workspaceId: z.string().uuid(), limit: z.number().int().positive().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("evolution_error_logs")
      .select("id, operation, method, url, status, error_message, response_body, request_body, base_url, instance_name, whatsapp_number_id, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
