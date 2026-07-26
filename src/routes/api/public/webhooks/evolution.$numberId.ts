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

        // Enfileira o webhook e responde 200 imediatamente. O drain (pg_cron)
        // processa a fila em background, evitando reenvios da Evolution quando
        // o processamento passa de alguns segundos.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("webhook_events").insert({
            source: "evolution",
            whatsapp_number_id: numberId,
            payload: payload as never,
            raw_body: raw.length > 1_000_000 ? null : raw,
          });
          if (error) {
            // Fallback: se falhar ao enfileirar, processa síncrono pra não perder.
            const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
            await processEvolutionPayload(numberId, payload, { touchWebhook: true, source: "webhook-fallback" });
            return jsonResponse({ ok: true, mode: "sync-fallback" });
          }
          return jsonResponse({ ok: true, queued: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "enqueue failed";
          return textResponse(message, { status: 500 });
        }
      },
    },
  },
});
