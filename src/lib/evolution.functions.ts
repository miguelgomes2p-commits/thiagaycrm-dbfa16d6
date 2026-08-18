import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logEvolutionError } from "@/lib/evolution-logging.server";

/**
 * Origem fixa dos webhooks da Evolution.
 * NÃO usar o domínio customizado (crm.lupusassessoria.com): o servidor da
 * Evolution não consegue entregar POSTs nele, e thiagaycrm.lovable.app
 * responde 307 para o domínio customizado (POST perde o corpo no redirect).
 * Esta URL estável do projeto responde 200 direto.
 */
const WEBHOOK_ORIGIN = "https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app";

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

    // Modo do workspace define o escopo da conexão:
    // individual -> conexão do próprio membro; shared -> conexão única do workspace (admin).
    const { data: wsRow } = await context.supabase
      .from("workspaces")
      .select("workspace_mode")
      .eq("id", data.workspaceId)
      .maybeSingle();
    const isShared = (wsRow as { workspace_mode?: string } | null)?.workspace_mode === "shared";

    if (isShared) {
      const { data: member } = await context.supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", data.workspaceId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        throw new Error("Neste workspace o WhatsApp é compartilhado — apenas owner/admin pode conectar.");
      }
      const { count } = await context.supabase
        .from("whatsapp_numbers")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId);
      if ((count ?? 0) > 0) {
        throw new Error("Workspace compartilhado permite apenas uma conexão de WhatsApp.");
      }
    }

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
        connection_scope: isShared ? "workspace" : "agent",
        default_owner_id: isShared ? null : context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const webhookUrl = `${WEBHOOK_ORIGIN}/api/public/webhooks/evolution/${inserted.id}`;

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
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name, last_webhook_at, created_at")
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
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: num, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("workspace_id, provider, provider_base_url, provider_api_key, instance_name, last_webhook_at, created_at")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }
    try {
      const { evolutionConnectionState, evolutionFindMessages, evolutionSetWebhook } = await import("@/lib/evolution.server");
      const s = await evolutionConnectionState(num.provider_base_url, num.provider_api_key, num.instance_name);
      const state = s.instance?.state ?? "close";
      const now = Date.now();
      const lastActivityMs = num.last_webhook_at ? new Date(num.last_webhook_at).getTime() : 0;
      const recentActivity = lastActivityMs > 0 && now - lastActivityMs < 15 * 60 * 1000;
      const mapped =
        state === "open"
          ? "connected"
          : state === "connecting"
            ? "connecting"
            : state === "close"
              ? recentActivity
                ? "connected"
                : "disconnected"
              : "error";
      await context.supabase
        .from("whatsapp_numbers")
        .update({
          connection_status: mapped,
          ...(mapped === "connected" ? { last_webhook_at: new Date().toISOString() } : {}),
        })
        .eq("id", data.id);

      if (state === "open") {
        const webhookOrigin = WEBHOOK_ORIGIN;
        const webhookUrl = `${webhookOrigin}/api/public/webhooks/evolution/${data.id}`;
        try {
          const { evolutionFetchInstance } = await import("@/lib/evolution.server");
          const info = await evolutionFetchInstance(num.provider_base_url, num.provider_api_key, num.instance_name);
          const arr = Array.isArray(info) ? info : [info];
          const first = (arr[0] ?? {}) as Record<string, unknown>;
          const inst = ((first.instance ?? first) as Record<string, unknown>) ?? {};
          const ownerJid =
            (inst.owner as string | undefined) ??
            (inst.ownerJid as string | undefined) ??
            (first.ownerJid as string | undefined) ??
            null;
          const profileName =
            (inst.profileName as string | undefined) ??
            (first.profileName as string | undefined) ??
            (inst.pushName as string | undefined) ??
            null;
          if (ownerJid || profileName) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin
              .from("whatsapp_numbers")
              .update({ wa_owner_jid: ownerJid, wa_profile_name: profileName })
              .eq("id", data.id);
          }
        } catch (fetchErr) {
          await logEvolutionError({
            workspaceId: num.workspace_id,
            whatsappNumberId: data.id,
            operation: "checkStatus.fetchInstance",
            baseUrl: num.provider_base_url,
            instanceName: num.instance_name,
            error: fetchErr,
          });
        }
        await evolutionSetWebhook(num.provider_base_url, num.provider_api_key, num.instance_name, webhookUrl).catch((webhookError) =>
          logEvolutionError({
            workspaceId: num.workspace_id,
            whatsappNumberId: data.id,
            operation: "checkStatus.setWebhook",
            baseUrl: num.provider_base_url,
            instanceName: num.instance_name,
            error: webhookError,
          }),
        );

        if (!lastActivityMs || now - lastActivityMs > 60_000) {
          try {
            const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
            const sinceSec = Math.floor((now - 3 * 24 * 60 * 60 * 1000) / 1000);
            const payload = await evolutionFindMessages(num.provider_base_url, num.provider_api_key, num.instance_name, 50, sinceSec);
            await processEvolutionPayload(data.id, { event: "MESSAGES_SET", data: payload }, { touchWebhook: true, source: "statusWarmSync" });
          } catch (syncError) {
            await logEvolutionError({
              workspaceId: num.workspace_id,
              whatsappNumberId: data.id,
              operation: "checkStatus.warmSync",
              baseUrl: num.provider_base_url,
              instanceName: num.instance_name,
              error: syncError,
            });
          }
        }
      }
      return { state, mapped };
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
    const webhookUrl = `${WEBHOOK_ORIGIN}/api/public/webhooks/evolution/${data.id}`;
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
    z.object({ id: z.string().uuid(), limit: z.number().int().positive().max(100).optional() }).parse(d),
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

    try {
      const { evolutionFindMessages } = await import("@/lib/evolution.server");
      const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
      const sevenDaysAgoSec = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
      const limit = Math.min(data.limit ?? 100, 100);
      const MAX_PAGES = 8; // até 800 mensagens em uma sincronização
      const aggregated: {
        insertedMessages: number;
        rowsSeen: number;
        skippedDuplicates: number;
        createdConversations: number;
        errors: number;
      } = { insertedMessages: 0, rowsSeen: 0, skippedDuplicates: 0, createdConversations: 0, errors: 0 };
      let hasRange = true;
      for (let page = 1; page <= MAX_PAGES; page++) {
        let payload: unknown;
        try {
          payload = hasRange
            ? await evolutionFindMessages(num.provider_base_url, num.provider_api_key, num.instance_name, limit, sevenDaysAgoSec, page)
            : await evolutionFindMessages(num.provider_base_url, num.provider_api_key, num.instance_name, limit, undefined, page);
        } catch (syncError) {
          if ((syncError as { status?: number }).status !== 400 || !hasRange) throw syncError;
          hasRange = false;
          payload = await evolutionFindMessages(num.provider_base_url, num.provider_api_key, num.instance_name, limit, undefined, page);
        }
        const stats = await processEvolutionPayload(data.id, { event: "MESSAGES_SET", data: payload }, { touchWebhook: true, source: "manualSync" });
        aggregated.insertedMessages += stats.insertedMessages;
        aggregated.rowsSeen += stats.rowsSeen;
        aggregated.skippedDuplicates += stats.skippedDuplicates;
        aggregated.createdConversations += stats.createdConversations;
        aggregated.errors += stats.errors;
        if (stats.rowsSeen < limit) break; // última página
      }
      return { ok: true, stats: aggregated };
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
    z.object({ workspaceId: z.string().uuid(), limit: z.number().int().positive().max(25).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("Workspace não encontrado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: numbers, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, provider, provider_base_url, provider_api_key, instance_name, connection_status, last_webhook_at, created_at, updated_at")
      .eq("workspace_id", data.workspaceId)
      .eq("provider", "evolution")
      .eq("is_active", true)
      .not("provider_base_url", "is", null)
      .not("provider_api_key", "is", null)
      .not("instance_name", "is", null);
    if (error) throw new Error(error.message);

    const { evolutionConnectionState, evolutionFindMessages, evolutionSetWebhook } = await import("@/lib/evolution.server");
    const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");

    // Sincroniza todos os números plausivelmente vivos. A Evolution pode reportar
    // "close" logo após um novo aparelho conectar, mesmo recebendo webhooks; não
    // podemos parar o fallback por causa desse falso negativo.
    const now = Date.now();
    const connectedNumbers = (numbers ?? []).filter((num) => {
      if (num.connection_status === "error") return false;
      const lastActivityMs = num.last_webhook_at ? new Date(num.last_webhook_at).getTime() : 0;
      const createdMs = num.created_at ? new Date(num.created_at).getTime() : 0;
      const recentlyActive = lastActivityMs > 0 && now - lastActivityMs < 24 * 60 * 60 * 1000;
      const recentlyCreated = createdMs > 0 && now - createdMs < 24 * 60 * 60 * 1000;
      return num.connection_status !== "disconnected" || recentlyActive || recentlyCreated;
    });
    const results: Array<{ id: string; ok: boolean; insertedMessages?: number; rowsSeen?: number; error?: string }> = [];

    const syncOneNumber = async (num: typeof connectedNumbers[number]) => {
      try {
        const nowMs = Date.now();
        const createdMs = num.created_at ? new Date(num.created_at).getTime() : 0;
        const updatedMs = num.updated_at ? new Date(num.updated_at).getTime() : 0;
        if (createdMs > 0 && nowMs - createdMs > 30_000 && updatedMs > 0 && nowMs - updatedMs < 8_000) {
          results.push({ id: num.id, ok: true, insertedMessages: 0, rowsSeen: 0 });
          return;
        }

        const lastActivityMs = num.last_webhook_at ? new Date(num.last_webhook_at).getTime() : 0;
        const recentlyActive = lastActivityMs > 0 && Date.now() - lastActivityMs < 15 * 60 * 1000;
        try {
          const state = (await evolutionConnectionState(num.provider_base_url!, num.provider_api_key!, num.instance_name!)).instance?.state ?? "close";
          if (state === "open") {
            await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: "connected" }).eq("id", num.id);
            // Nunca reapontar para o domínio customizado: ele redireciona POSTs e
            // faz a Evolution perder o corpo/evento. O auto-sync estava desfazendo
            // a correção aplicada pelo botão "Sincronizar webhook".
            const webhookUrl = `${WEBHOOK_ORIGIN}/api/public/webhooks/evolution/${num.id}`;
            await evolutionSetWebhook(num.provider_base_url!, num.provider_api_key!, num.instance_name!, webhookUrl).catch((webhookError) =>
              logEvolutionError({
                workspaceId: data.workspaceId,
                whatsappNumberId: num.id,
                operation: "workspaceSync.setWebhook",
                baseUrl: num.provider_base_url,
                instanceName: num.instance_name,
                error: webhookError,
              }),
            );
          } else if (state === "close" && !recentlyActive && num.connection_status === "connected") {
            await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: "disconnected" }).eq("id", num.id);
          }
        } catch (stateError) {
          await logEvolutionError({
            workspaceId: data.workspaceId,
            whatsappNumberId: num.id,
            operation: "workspaceSync.connectionState",
            baseUrl: num.provider_base_url,
            instanceName: num.instance_name,
            error: stateError,
          });
        }

        const sinceSec = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
        const limit = Math.min(data.limit ?? 25, 25);
        let payload: unknown;
        try {
          payload = await evolutionFindMessages(num.provider_base_url!, num.provider_api_key!, num.instance_name!, limit, sinceSec);
        } catch (syncError) {
          if ((syncError as { status?: number }).status !== 400) throw syncError;
          payload = await evolutionFindMessages(num.provider_base_url!, num.provider_api_key!, num.instance_name!, limit);
        }
        const stats = await processEvolutionPayload(num.id, { event: "MESSAGES_SET", data: payload }, { touchWebhook: true, source: "workspaceAutoSync" });
        await supabaseAdmin.from("whatsapp_numbers").update({ updated_at: new Date().toISOString() }).eq("id", num.id);
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
    };

    // Concorrência limitada (4) para reduzir o tempo total de N contas de "soma" para "máximo",
    // sem sobrecarregar a Evolution API.
    const CONCURRENCY = 4;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, connectedNumbers.length) }, async () => {
      while (cursor < connectedNumbers.length) {
        const idx = cursor++;
        await syncOneNumber(connectedNumbers[idx]);
      }
    });
    await Promise.all(workers);
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
