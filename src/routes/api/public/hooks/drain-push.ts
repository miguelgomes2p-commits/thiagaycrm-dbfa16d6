import { createFileRoute } from "@tanstack/react-router";

/**
 * Drenador da fila de push (best effort). Chamado pelo trigger via pg_net.
 * Nunca afeta mensagens, webhooks ou atribuição — apenas consome push_queue.
 */
async function drain() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendToUser, hasVapidKeys } = await import("@/lib/push.server");

  if (!hasVapidKeys()) {
    return { processed: 0, skipped: "vapid_keys_missing" };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("push_queue")
    .select("id, workspace_id, user_id, conversation_id, event_type, title, body, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) return { processed: 0, error: error.message };
  if (!rows?.length) return { processed: 0 };

  let processed = 0;
  for (const row of rows) {
    // Marca como processing antes de enviar (evita duplicidade entre execuções paralelas)
    const { data: locked } = await supabaseAdmin
      .from("push_queue")
      .update({ status: "processing", attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!locked) continue;

    const result = await sendToUser({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      type: row.event_type as "NEW_LEAD_ASSIGNED" | "NEW_CUSTOMER_MESSAGE",
      title: row.title,
      body: row.body ?? "",
      conversationId: row.conversation_id,
    });

    const failed = result.sent === 0 && (result.failed > 0 || !!result.error);
    await supabaseAdmin
      .from("push_queue")
      .update({
        status: failed ? "failed" : "sent",
        error: result.error ?? null,
      })
      .eq("id", row.id);
    processed++;
  }

  return { processed };
}

export const Route = createFileRoute("/api/public/hooks/drain-push")({
  server: {
    handlers: {
      POST: async () => {
        try {
          return Response.json(await drain());
        } catch (e) {
          console.error("[drain-push]", e);
          return Response.json({ processed: 0, error: "drain_failed" }, { status: 200 });
        }
      },
      GET: async () => {
        try {
          return Response.json(await drain());
        } catch {
          return Response.json({ processed: 0, error: "drain_failed" }, { status: 200 });
        }
      },
    },
  },
});
