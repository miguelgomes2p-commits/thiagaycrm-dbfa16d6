import { createFileRoute } from "@tanstack/react-router";
import { runInBackground } from "@/lib/request-context";


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
          return textResponse("evolution instance not registered in CRM", { status: 404 });
        }

        const forwardToN8n = async () => {
          const url = wa.n8n_webhook_url?.trim();
          if (!url) return { configured: false, forwarded: false };

          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const auth = wa.n8n_webhook_auth_header?.trim();
          if (auth) headers.Authorization = auth;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const logForwardIssue = async (message: string, extra?: Record<string, unknown>) => {
            try {
              await supabaseAdmin.from("evolution_error_logs").insert({
                workspace_id: wa.workspace_id,
                whatsapp_number_id: wa.id,
                operation: "n8n_forward",
                error_message: message,
                response_body: extra ? JSON.stringify(extra).slice(0, 4000) : null,
              });
            } catch {}
          };

          try {
            const res = await fetch(url, { method: "POST", headers, body: raw, signal: controller.signal });
            if (!res.ok) await logForwardIssue(`N8N respondeu ${res.status}`, { url, status: res.status });
            return { configured: true, forwarded: res.ok, status: res.status };
          } catch (err) {
            const message = err instanceof Error ? err.message : "N8N forward failed";
            await logForwardIssue(message, { url });
            return { configured: true, forwarded: false, error: message };
          } finally {
            clearTimeout(timeout);
          }
        };

        const processPayload = async () => {
          const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
          return processEvolutionPayload(wa.id, payload, { touchWebhook: true, source: "webhook" });
        };

        const [forwardResult, processResult] = await Promise.allSettled([forwardToN8n(), processPayload()]);
        const n8n = forwardResult.status === "fulfilled" ? forwardResult.value : { configured: false, forwarded: false };

        if (processResult.status === "rejected") {
          const message = processResult.reason instanceof Error ? processResult.reason.message : "webhook error";
          return textResponse(message, { status: 500 });
        }

        return jsonResponse({ ok: true, ...processResult.value, n8n });
      },
    },
  },
});