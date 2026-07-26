import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-api-key",
  "Access-Control-Max-Age": "86400",
};

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

export const Route = createFileRoute("/api/public/webhooks/evolution/$numberId")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () => textResponse("ok"),
      POST: async ({ request, params }) => {
        // Guard: URLs configuradas com template literal `{numberId}` não devem
        // gerar 500 (a Evolution reenviaria em loop e satura ACKs legítimos).
        const numberId = params.numberId;
        if (!numberId || numberId === "{numberId}" || !/^[0-9a-f-]{36}$/i.test(numberId)) {
          return jsonResponse({ ok: false, ignored: "invalid numberId in webhook URL" }, { status: 200 });
        }
        const raw = await request.text();
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return textResponse("bad json", { status: 400 });
        }


        const forwardToN8n = async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: wa } = await supabaseAdmin
            .from("whatsapp_numbers")
            .select("n8n_webhook_url, n8n_webhook_auth_header, workspace_id")
            .eq("id", params.numberId)
            .maybeSingle();

          const url = wa?.n8n_webhook_url?.trim();
          if (url && wa) {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const auth = wa.n8n_webhook_auth_header?.trim();
            if (auth) headers["Authorization"] = auth;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const logForwardIssue = async (message: string, extra?: Record<string, unknown>) => {
              try {
                await supabaseAdmin.from("evolution_error_logs").insert({
                  workspace_id: wa.workspace_id,
                  whatsapp_number_id: params.numberId,
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
              await logForwardIssue(err instanceof Error ? err.message : "N8N forward failed", { url });
              return { configured: true, forwarded: false, error: err instanceof Error ? err.message : "N8N forward failed" };
            } finally {
              clearTimeout(timeout);
            }
          }
          return { configured: false, forwarded: false };
        };

        const processPayload = async () => {
          const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
          return processEvolutionPayload(params.numberId, payload, { touchWebhook: true, source: "webhook" });
        };

        const [forwardResult, processResult] = await Promise.allSettled([forwardToN8n(), processPayload()]);
        const n8n = forwardResult.status === "fulfilled" ? forwardResult.value : { configured: false, forwarded: false };

        if (processResult.status === "rejected") {
          const error = processResult.reason instanceof Error ? processResult.reason.message : "webhook error";
          // Números que não existem mais no CRM: responder 200 para a Evolution
          // não reenfileirar o webhook em loop (sobrecarga que afeta ACKs).
          if (/não encontrado|not found/i.test(error)) {
            return jsonResponse({ ok: false, ignored: error }, { status: 200 });
          }
          return textResponse(error, { status: 500 });
        }


        return jsonResponse({ ok: true, ...processResult.value, n8n });
      },
    },
  },
});
