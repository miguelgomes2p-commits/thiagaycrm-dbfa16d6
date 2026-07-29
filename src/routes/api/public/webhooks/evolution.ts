import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-api-key, x-webhook-token",
  "Access-Control-Max-Age": "86400",
};

type Json = Record<string, unknown>;

function textResponse(body: string, init?: ResponseInit) {
  return new Response(body, { ...init, headers: { ...corsHeaders, ...(init?.headers ?? {}) } });
}
function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: { ...corsHeaders, ...(init?.headers ?? {}) } });
}
function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
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
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function extractToken(request: Request, url: URL) {
  const header = request.headers.get("x-webhook-token") ?? request.headers.get("x-hub-signature") ?? null;
  if (header && header.trim()) return header.trim();
  const q = url.searchParams.get("token");
  return q && q.trim() ? q.trim() : null;
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

        const url = new URL(request.url);
        const providedToken = extractToken(request, url);

        const raw = await request.text();
        let payload: Json;
        try {
          payload = JSON.parse(raw) as Json;
        } catch {
          return textResponse("bad json", { status: 400 });
        }

        const instanceName = resolveInstanceName(payload);
        if (!instanceName) return textResponse("instance not found in payload", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: wa, error } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("id, workspace_id, webhook_verify_token, n8n_webhook_url, n8n_webhook_auth_header")
          .eq("provider", "evolution")
          .eq("instance_name", instanceName)
          .maybeSingle();

        if (error || !wa) {
          return jsonResponse({ ok: false, ignored: "evolution instance not registered", instance: instanceName }, { status: 200 });
        }
        // Token validation is advisory for now (see numberId webhook).
        if (providedToken && wa.webhook_verify_token && !safeEqual(providedToken, wa.webhook_verify_token)) {
          logWebhook("token_mismatch_advisory", { request_id: requestId, trace_id: traceId, whatsapp_number_id: wa.id, instance: instanceName });
        } else if (!providedToken) {
          logWebhook("token_missing_advisory", { request_id: requestId, trace_id: traceId, whatsapp_number_id: wa.id, instance: instanceName });
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
          const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
          const result = await processEvolutionPayload(wa.id, withTrace(payload, traceId, requestId), { touchWebhook: true, source: "webhook-fallback" });
          logWebhook("sync_fallback", { request_id: requestId, trace_id: traceId, whatsapp_number_id: wa.id, instance: instanceName, duration_ms: Date.now() - startedAt, warning: err instanceof Error ? err.message.slice(0, 500) : "enqueue failed" });
          return jsonResponse({ ok: true, request_id: requestId, trace_id: traceId, mode: "sync-fallback", warning: err instanceof Error ? err.message : "enqueue failed", ...result });
        }
      },
    },
  },
});
