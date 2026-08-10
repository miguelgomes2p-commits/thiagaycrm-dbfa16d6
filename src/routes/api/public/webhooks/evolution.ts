import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-api-key",
  "Access-Control-Max-Age": "86400",
};

type Json = Record<string, unknown>;

function textResponse(body: string, init?: ResponseInit) {
  return new Response(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers ?? {}) },
  });
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers ?? {}) },
  });
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getNode(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function logWebhook(event: string, data: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "evolution_webhook", event, ts: new Date().toISOString(), ...data }));
}

function withTrace(payload: Json, traceId: string, requestId: string) {
  return { ...payload, _crm_trace: { trace_id: traceId, request_id: requestId, received_at: new Date().toISOString() } };
}

function resolveInstanceName(payload: Json) {
  const data = getNode(payload.data);
  const instance = getNode(payload.instance);
  const dataInstance = getNode(data?.instance);

  return firstString(
    payload.instance,
    payload.instanceName,
    payload.instance_name,
    data?.instance,
    data?.instanceName,
    data?.instance_name,
    instance?.instanceName,
    instance?.instance_name,
    dataInstance?.instanceName,
    dataInstance?.instance_name,
  );
}

export const Route = createFileRoute("/api/public/webhooks/evolution")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () => textResponse("ok"),
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        const traceId = request.headers.get("x-correlation-id") ?? request.headers.get("x-request-id") ?? requestId;
        const startedAt = Date.now();
        const raw = await request.text();
        let payload: Json;
        try {
          payload = JSON.parse(raw) as Json;
        } catch {
          return textResponse("bad json", { status: 400 });
        }

        const instanceName = resolveInstanceName(payload);
        if (!instanceName) {
          return textResponse("instance not found in payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: wa, error } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("id, workspace_id, n8n_webhook_url, n8n_webhook_auth_header")
          .eq("provider", "evolution")
          .eq("instance_name", instanceName)
          .maybeSingle();

        if (error || !wa) {
          // 200 para evitar retry-loop da Evolution quando a instância não está mais no CRM.
          return jsonResponse({ ok: false, ignored: "evolution instance not registered", instance: instanceName }, { status: 200 });
        }


        try {
          const evt = String((payload as Record<string, unknown>).event ?? (payload as Record<string, unknown>).type ?? "").toLowerCase();
          const eventKind = evt === "messages.set" || evt === "messages_set" ? "history" : "realtime";
          const { error: enqueueError } = await supabaseAdmin.from("webhook_events").insert({
            source: "evolution",
            whatsapp_number_id: wa.id,
            payload: withTrace(payload, traceId, requestId) as never,
            raw_body: raw.length > 1_000_000 ? null : raw,
            event_kind: eventKind,
          } as never);

          if (enqueueError) throw enqueueError;

          logWebhook("queued", { request_id: requestId, trace_id: traceId, whatsapp_number_id: wa.id, instance: instanceName, duration_ms: Date.now() - startedAt });
          return jsonResponse({ ok: true, request_id: requestId, trace_id: traceId, queued: true, whatsapp_number_id: wa.id });
        } catch (err) {
          // Fallback síncrono: se a fila falhar, não perde a mensagem.
          const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
          const { enqueueN8nDelivery } = await import("@/lib/n8n-delivery.server");
          const traced = withTrace(payload, traceId, requestId);
          // Conversation resolvida ANTES do n8n para popular crm_context.
          const result = await processEvolutionPayload(wa.id, traced, { touchWebhook: true, source: "webhook-fallback" });
          await enqueueN8nDelivery({
            whatsappNumberId: wa.id,
            payload: traced,
            traceId,
            requestId,
            instanceName,
            crmContext: {
              conversation_id: result.conversationIds[0] ?? null,
              workspace_id: result.workspaceId,
              workspace_mode: result.workspaceMode,
            },
          });
          logWebhook("sync_fallback", { request_id: requestId, trace_id: traceId, whatsapp_number_id: wa.id, instance: instanceName, duration_ms: Date.now() - startedAt, warning: err instanceof Error ? err.message.slice(0, 500) : "enqueue failed" });
          return jsonResponse({ ok: true, request_id: requestId, trace_id: traceId, mode: "sync-fallback", warning: err instanceof Error ? err.message : "enqueue failed", ...result });
        }
      },
    },
  },
});