/**
 * PushNotificationService — módulo isolado de Web Push (VAPID).
 * Best effort: qualquer falha aqui nunca deve propagar para o fluxo principal do CRM.
 */
import { buildPushPayload } from "@block65/webcrypto-web-push";

export type PushEventType =
  | "NEW_LEAD_ASSIGNED"
  | "NEW_CUSTOMER_MESSAGE"
  | "TEST_NOTIFICATION";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function getVapid() {
  return {
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:suporte@lupusassessoria.com",
    publicKey: process.env["VAPID_PUBLIC_KEY"],
    privateKey: process.env["VAPID_PRIVATE_KEY"],
  };
}

export function hasVapidKeys(): boolean {
  const v = getVapid();
  return !!v.publicKey && !!v.privateKey;
}

async function sendOne(
  sub: SubscriptionRow,
  payload: { title: string; body: string; data: { workspace_id: string; conversation_id: string | null; type: string } },
): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  try {
    const init = await buildPushPayload(
      { data: payload, options: { ttl: 60 * 60 * 12, urgency: "high" } },
      { endpoint: sub.endpoint, expirationTime: null, keys: { auth: sub.auth, p256dh: sub.p256dh } },
      getVapid(),
    );
    const res = await fetch(sub.endpoint, {
      method: init.method,
      headers: init.headers,
      body: init.body as unknown as BodyInit,
    });
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
    if (!res.ok) return { ok: false, gone: false, error: `http_${res.status}` };
    return { ok: true, gone: false };
  } catch (e) {
    return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Envia para todos os dispositivos ativos de um usuário, respeitando o workspace. */
export async function sendToUser(args: {
  workspaceId: string;
  userId: string;
  type: PushEventType;
  title: string;
  body: string;
  conversationId?: string | null;
}): Promise<{ sent: number; failed: number; removed: number; error?: string }> {
  if (!hasVapidKeys()) return { sent: 0, failed: 0, removed: 0, error: "vapid_keys_missing" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", args.userId)
    .eq("enabled", true);

  if (error) return { sent: 0, failed: 0, removed: 0, error: error.message };
  if (!subs?.length) return { sent: 0, failed: 0, removed: 0 };

  const payload = {
    title: args.title,
    body: (args.body ?? "").slice(0, 140),
    data: {
      workspace_id: args.workspaceId,
      conversation_id: args.conversationId ?? null,
      type: args.type,
    },
  };

  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  let lastError: string | undefined;

  for (const sub of subs as SubscriptionRow[]) {
    const r = await sendOne(sub, payload);
    if (r.ok) {
      sent++;
      await supabaseAdmin
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", sub.id);
    } else if (r.gone) {
      gone.push(sub.id);
    } else {
      failed++;
      lastError = r.error;
    }
  }

  const removed = await cleanupInvalidSubscriptions(gone);
  return { sent, failed, removed, error: lastError };
}

/** Desativa subscriptions que o provider reportou como inexistentes (404/410). */
export async function cleanupInvalidSubscriptions(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subscriptions").delete().in("id", ids);
    return ids.length;
  } catch {
    return 0;
  }
}
