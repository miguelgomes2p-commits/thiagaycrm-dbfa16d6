import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
    // 1) Cria o registro local primeiro para termos o ID (usado no webhook)
    const { data: inserted, error } = await context.supabase
      .from("whatsapp_numbers")
      .insert({
        workspace_id: data.workspaceId,
        label: data.label,
        display_number: data.displayNumber,
        provider: "evolution",
        provider_base_url: data.baseUrl.replace(/\/+$/, ""),
        provider_api_key: data.apiKey,
        instance_name: data.instanceName,
        connection_status: "connecting",
        default_owner_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const webhookUrl = `${data.webhookOrigin.replace(/\/+$/, "")}/api/public/webhooks/evolution/${inserted.id}`;

    // 2) Cria a instância na Evolution
    try {
      const { evolutionCreateInstance } = await import("@/lib/evolution.server");
      const created = await evolutionCreateInstance(data.baseUrl, data.apiKey, data.instanceName, webhookUrl);
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
      // Se falhar, remove o registro para não deixar lixo
      await context.supabase.from("whatsapp_numbers").delete().eq("id", inserted.id);
      throw new Error(e instanceof Error ? e.message : String(e));
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
      .select("provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }

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
      .select("provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }
    const { evolutionConnectionState } = await import("@/lib/evolution.server");
    const s = await evolutionConnectionState(num.provider_base_url, num.provider_api_key, num.instance_name);
    const state = s.instance?.state ?? "close";
    const mapped =
      state === "open" ? "connected" : state === "connecting" ? "connecting" : state === "close" ? "disconnected" : "error";
    await context.supabase.from("whatsapp_numbers").update({ connection_status: mapped }).eq("id", data.id);
    return { state, mapped };
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
      .select("provider, provider_base_url, provider_api_key, instance_name")
      .eq("id", data.id)
      .single();
    if (error || !num) throw new Error("Número não encontrado");
    if (num.provider !== "evolution" || !num.provider_base_url || !num.provider_api_key || !num.instance_name) {
      throw new Error("Este número não é uma instância Evolution");
    }
    const { evolutionLogout } = await import("@/lib/evolution.server");
    await evolutionLogout(num.provider_base_url, num.provider_api_key, num.instance_name);
    await context.supabase
      .from("whatsapp_numbers")
      .update({ connection_status: "disconnected", last_qr: null, last_qr_at: null })
      .eq("id", data.id);
    return { ok: true };
  });
