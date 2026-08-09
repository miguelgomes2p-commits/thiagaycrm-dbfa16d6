import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMember(supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }, workspaceId: string, userId: string) {
  const { data } = await supabase.rpc("is_workspace_member", { _workspace_id: workspaceId, _user_id: userId });
  if (!data) throw new Error("Sem acesso a este workspace");
}

export const getN8nHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; status?: string; search?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recent } = await supabaseAdmin
      .from("n8n_deliveries")
      .select("status")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", since);

    const summary = { delivered: 0, pending: 0, retry: 0, processing: 0, dead_letter: 0 };
    for (const row of recent ?? []) {
      const key = row.status as keyof typeof summary;
      if (key in summary) summary[key] += 1;
    }

    let query = supabaseAdmin
      .from("n8n_deliveries")
      .select("id, wa_message_id, trace_id, phone, event_name, status, attempts, http_status, last_error, duration_ms, next_retry_at, delivered_at, created_at, whatsapp_number_id")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.search?.trim()) {
      const term = `%${data.search.trim()}%`;
      query = query.or(`wa_message_id.ilike.${term},trace_id.ilike.${term},phone.ilike.${term}`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return { summary, rows: rows ?? [] };
  });

export const retryN8nDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; deliveryId?: string; allDeadLetters?: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase as never, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let update = supabaseAdmin
      .from("n8n_deliveries")
      .update({ status: "retry", attempts: 0, next_retry_at: new Date().toISOString(), locked_at: null, last_error: null })
      .eq("workspace_id", data.workspaceId);

    update = data.deliveryId ? update.eq("id", data.deliveryId) : update.eq("status", "dead_letter");

    const { data: rows, error } = await update.select("id");
    if (error) throw new Error(error.message);

    const { drainN8nDeliveries } = await import("@/lib/n8n-delivery.server");
    const result = await drainN8nDeliveries(50);

    return { requeued: rows?.length ?? 0, ...result };
  });
