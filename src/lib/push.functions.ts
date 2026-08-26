import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Chave pública VAPID (segura para o browser). */
export const getPushPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    publicKey: process.env["VAPID_PUBLIC_KEY"] ?? null,
  }));

/** Registra (ou reativa) o dispositivo atual do usuário logado. */
export const subscribeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      workspaceId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      deviceLabel?: string;
      userAgent?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Multi-tenant: só permite registrar em workspace do qual o usuário é membro.
    const { data: member, error: memberErr } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw new Error(memberErr.message);
    if (!member) throw new Error("Workspace inválido para este usuário.");

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        workspace_id: data.workspaceId,
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        device_label: data.deviceLabel ?? null,
        user_agent: (data.userAgent ?? "").slice(0, 300) || null,
        enabled: true,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove o dispositivo atual (desativar neste dispositivo). */
export const unsubscribeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lista os dispositivos do próprio usuário. */
export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, device_label, enabled, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Envia uma notificação de teste para os dispositivos do próprio usuário. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Workspace inválido para este usuário.");

    const { sendToUser } = await import("@/lib/push.server");
    const result = await sendToUser({
      workspaceId: data.workspaceId,
      userId,
      type: "TEST_NOTIFICATION",
      title: "🔔 Notificação de teste",
      body: "As notificações do CRM estão funcionando corretamente.",
      conversationId: null,
    });
    return result;
  });
