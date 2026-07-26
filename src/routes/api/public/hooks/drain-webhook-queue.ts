import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MS = 60_000;

async function forwardToN8n(
  supabaseAdmin: Awaited<ReturnType<typeof getAdmin>>,
  numberId: string,
  rawBody: string | null,
  payload: unknown,
) {
  const { data: wa } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("n8n_webhook_url, n8n_webhook_auth_header, workspace_id")
    .eq("id", numberId)
    .maybeSingle();
  const url = wa?.n8n_webhook_url?.trim();
  if (!url || !wa) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = wa.n8n_webhook_auth_header?.trim();
  if (auth) headers["Authorization"] = auth;

  const body = rawBody ?? JSON.stringify(payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!res.ok) {
      await supabaseAdmin.from("evolution_error_logs").insert({
        workspace_id: wa.workspace_id,
        whatsapp_number_id: numberId,
        operation: "n8n_forward",
        error_message: `N8N respondeu ${res.status}`,
        response_body: null,
      });
    }
  } catch (err) {
    await supabaseAdmin.from("evolution_error_logs").insert({
      workspace_id: wa.workspace_id,
      whatsapp_number_id: numberId,
      operation: "n8n_forward",
      error_message: err instanceof Error ? err.message : "N8N forward failed",
      response_body: null,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

export const Route = createFileRoute("/api/public/hooks/drain-webhook-queue")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async () => {
        const supabaseAdmin = await getAdmin();

        // Reabre eventos travados há mais tempo do que LOCK_TIMEOUT_MS (crash do worker).
        const staleCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
        await supabaseAdmin
          .from("webhook_events")
          .update({ status: "pending", locked_at: null })
          .eq("status", "processing")
          .lt("locked_at", staleCutoff);

        // Reivindica lote: SELECT dos pendentes + UPDATE atômico via `id IN (...)`
        // + filtro `status = 'pending'`. pg_cron serializa execuções da MESMA
        // task, então corridas concorrentes só ocorrem se outro caller acionar
        // o drain — o filtro `.eq("status","pending")` no update evita dupla
        // reivindicação.
        const { data: pending } = await supabaseAdmin
          .from("webhook_events")
          .select("id, whatsapp_number_id, payload, raw_body, attempts")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (!pending || pending.length === 0) {
          return Response.json({ ok: true, processed: 0 }, { headers: corsHeaders });
        }
        const ids = pending.map((p) => p.id);
        const { data: claimed } = await supabaseAdmin
          .from("webhook_events")
          .update({ status: "processing", locked_at: new Date().toISOString() })
          .in("id", ids)
          .eq("status", "pending")
          .select("id, whatsapp_number_id, payload, raw_body, attempts");
        const batch = (claimed ?? []) as Array<{
          id: number;
          whatsapp_number_id: string;
          payload: unknown;
          raw_body: string | null;
          attempts: number;
        }>;
        // Incrementa attempts (não dá pra fazer numa única expressão via supabase-js).
        if (batch.length > 0) {
          await Promise.all(
            batch.map((row) =>
              supabaseAdmin
                .from("webhook_events")
                .update({ attempts: row.attempts + 1 })
                .eq("id", row.id),
            ),
          );
        }

        if (!batch || batch.length === 0) {
          return Response.json({ ok: true, processed: 0 }, { headers: corsHeaders });
        }

        const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");

        let ok = 0;
        let failed = 0;
        // Pré-verifica quais whatsapp_number_id ainda existem para não gastar
        // tentativas em números deletados (webhooks órfãos da Evolution).
        const uniqueNumberIds = Array.from(new Set(batch.map((b) => b.whatsapp_number_id).filter(Boolean)));
        const { data: existingRows } = uniqueNumberIds.length
          ? await supabaseAdmin.from("whatsapp_numbers").select("id").in("id", uniqueNumberIds)
          : { data: [] as Array<{ id: string }> };
        const existingSet = new Set((existingRows ?? []).map((r) => r.id));

        await Promise.all(
          batch.map(async (row) => {
            const numberId = row.whatsapp_number_id;
            if (!numberId || !existingSet.has(numberId)) {
              await supabaseAdmin
                .from("webhook_events")
                .update({ status: "done", processed_at: new Date().toISOString(), last_error: numberId ? "orphan: whatsapp_number deletado" : "missing numberId" })
                .eq("id", row.id);
              return;
            }
            try {
              await Promise.all([
                processEvolutionPayload(numberId, row.payload, { touchWebhook: true, source: "queue" }),
                forwardToN8n(supabaseAdmin, numberId, row.raw_body, row.payload),
              ]);
              await supabaseAdmin
                .from("webhook_events")
                .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
                .eq("id", row.id);
              ok += 1;
            } catch (err) {
              const message = err instanceof Error ? err.message : "unknown error";
              const nextStatus = row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
              await supabaseAdmin
                .from("webhook_events")
                .update({
                  status: nextStatus,
                  last_error: message.slice(0, 2000),
                  locked_at: null,
                })
                .eq("id", row.id);
              failed += 1;
            }
          }),
        );

        return Response.json({ ok: true, processed: batch.length, ok_count: ok, failed }, { headers: corsHeaders });
      },
    },
  },
});
