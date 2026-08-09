import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MS = 60_000;
const MAX_CYCLES = 6;
const REALTIME_CONCURRENCY = 8;
const HISTORY_CONCURRENCY = 2;

type Kind = "realtime" | "history";

type PendingRow = {
  id: number;
  whatsapp_number_id: string;
  payload: unknown;
  raw_body: string | null;
  attempts: number;
  event_kind: Kind;
};

function logDrain(event: string, data: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "webhook_queue", event, ts: new Date().toISOString(), ...data }));
}

async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// O encaminhamento ao n8n deixou de ser "fire and forget": cada evento vira uma
// linha idempotente em `n8n_deliveries`, entregue com retry pelo drenador próprio.


async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

async function logTerminalIssue(
  supabaseAdmin: Awaited<ReturnType<typeof getAdmin>>,
  numberId: string | null,
  operation: string,
  message: string,
) {
  try {
    let workspaceId: string | null = null;
    if (numberId) {
      const { data } = await supabaseAdmin
        .from("whatsapp_numbers")
        .select("workspace_id")
        .eq("id", numberId)
        .maybeSingle();
      workspaceId = data?.workspace_id ?? null;
    }
    await supabaseAdmin.from("evolution_error_logs").insert({
      workspace_id: workspaceId,
      whatsapp_number_id: numberId,
      operation,
      error_message: message.slice(0, 2000),
    });
  } catch (err) {
    console.error("[webhook_queue] failed to log terminal issue:", err);
  }
}

export const Route = createFileRoute("/api/public/hooks/drain-webhook-queue")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async () => {
        const requestId = crypto.randomUUID();
        const startedAt = Date.now();
        const supabaseAdmin = await getAdmin();
        logDrain("start", { request_id: requestId });

        // Reabre eventos travados há mais tempo do que LOCK_TIMEOUT_MS.
        const staleCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
        await supabaseAdmin
          .from("webhook_events")
          .update({ status: "pending", locked_at: null })
          .eq("status", "processing")
          .lt("locked_at", staleCutoff);

        const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
        const { enqueueN8nDelivery, drainN8nDeliveries } = await import("@/lib/n8n-delivery.server");

        let totalProcessed = 0;
        let totalOk = 0;
        let totalFailed = 0;

        const processBatch = async (batch: PendingRow[], concurrency: number) => {
          // Pré-verifica quais whatsapp_number_id ainda existem.
          const uniqueNumberIds = Array.from(new Set(batch.map((b) => b.whatsapp_number_id).filter(Boolean)));
          const { data: existingRows } = uniqueNumberIds.length
            ? await supabaseAdmin.from("whatsapp_numbers").select("id").in("id", uniqueNumberIds)
            : { data: [] as Array<{ id: string }> };
          const existingSet = new Set((existingRows ?? []).map((r) => r.id));

          await runLimited(batch, concurrency, async (row) => {
            const eventStartedAt = Date.now();
            const numberId = row.whatsapp_number_id;
            const attempt = row.attempts + 1;
            if (!numberId || !existingSet.has(numberId)) {
              const reason = numberId ? "orphan: whatsapp_number deletado" : "missing numberId";
              await supabaseAdmin
                .from("webhook_events")
                .update({ status: "done", attempts: attempt, processed_at: new Date().toISOString(), last_error: reason })
                .eq("id", row.id);
              // Fase 2 item 4: torna órfãos visíveis na tela de logs.
              await logTerminalIssue(supabaseAdmin, numberId ?? null, "webhook_queue.orphan", `Evento #${row.id} descartado: ${reason}`);
              return;
            }
            try {
              const trace = (row.payload as { _crm_trace?: { trace_id?: string; request_id?: string } } | null)?._crm_trace;
              // Registra a entrega ao n8n antes de processar (idempotente).
              await enqueueN8nDelivery({
                whatsappNumberId: numberId,
                payload: row.payload,
                traceId: trace?.trace_id ?? null,
                requestId: trace?.request_id ?? requestId,
                webhookEventId: row.id,
              });
              await processEvolutionPayload(numberId, row.payload, { touchWebhook: true, source: "queue" });
              await supabaseAdmin
                .from("webhook_events")
                .update({ status: "done", attempts: attempt, processed_at: new Date().toISOString(), last_error: null })
                .eq("id", row.id);
              logDrain("event_done", { request_id: requestId, event_id: row.id, whatsapp_number_id: numberId, kind: row.event_kind, attempt, duration_ms: Date.now() - eventStartedAt });
              totalOk += 1;
            } catch (err) {
              const message = err instanceof Error ? err.message : "unknown error";
              const nextStatus = attempt >= MAX_ATTEMPTS ? "failed" : "pending";
              await supabaseAdmin
                .from("webhook_events")
                .update({
                  status: nextStatus,
                  attempts: attempt,
                  last_error: message.slice(0, 2000),
                  locked_at: null,
                })
                .eq("id", row.id);
              logDrain("event_failed", { request_id: requestId, event_id: row.id, whatsapp_number_id: numberId, kind: row.event_kind, attempt, next_status: nextStatus, duration_ms: Date.now() - eventStartedAt, error: message.slice(0, 500) });
              if (nextStatus === "failed") {
                // Fase 2 item 4: falha terminal fica visível na tela de logs.
                await logTerminalIssue(
                  supabaseAdmin,
                  numberId,
                  "webhook_queue.terminal_failure",
                  `Evento #${row.id} descartado após ${attempt} tentativas: ${message}`,
                );
              }
              totalFailed += 1;
            }
          });
        };

        const claim = async (kind: Kind, limit: number): Promise<PendingRow[]> => {
          const { data: pending } = await supabaseAdmin
            .from("webhook_events")
            .select("id")
            .eq("status", "pending")
            .eq("event_kind", kind)
            .order("created_at", { ascending: true })
            .limit(limit);
          if (!pending || pending.length === 0) return [];
          const ids = pending.map((p) => p.id);
          const { data: claimed } = await supabaseAdmin
            .from("webhook_events")
            .update({ status: "processing", locked_at: new Date().toISOString() })
            .in("id", ids)
            .eq("status", "pending")
            .select("id, whatsapp_number_id, payload, raw_body, attempts, event_kind");
          return (claimed ?? []) as PendingRow[];
        };

        // FASE A: drena tempo-real com concorrência alta (nunca compete com histórico).
        for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
          const batch = await claim("realtime", BATCH_SIZE);
          if (batch.length === 0) break;
          await processBatch(batch, REALTIME_CONCURRENCY);
          totalProcessed += batch.length;
          if (batch.length < BATCH_SIZE) break;
        }

        // FASE B: drena histórico com concorrência baixa (não trava tempo real).
        for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
          const batch = await claim("history", Math.max(20, Math.floor(BATCH_SIZE / 2)));
          if (batch.length === 0) break;
          await processBatch(batch, HISTORY_CONCURRENCY);
          totalProcessed += batch.length;
          if (batch.length < Math.max(20, Math.floor(BATCH_SIZE / 2))) break;
        }

        // FASE C: entrega ao n8n o que acabou de ser enfileirado (baixa latência).
        const n8n = await drainN8nDeliveries(50);

        logDrain("finish", { request_id: requestId, processed: totalProcessed, ok_count: totalOk, failed: totalFailed, n8n_delivered: n8n.delivered, n8n_failed: n8n.failed, duration_ms: Date.now() - startedAt });
        return Response.json({ ok: true, request_id: requestId, processed: totalProcessed, ok_count: totalOk, failed: totalFailed, n8n, duration_ms: Date.now() - startedAt }, { headers: corsHeaders });
      },
    },
  },
});
