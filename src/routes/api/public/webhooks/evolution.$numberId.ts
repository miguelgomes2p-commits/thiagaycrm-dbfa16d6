import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/evolution/$numberId")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request, params }) => {
        const raw = await request.text();
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        // Fire-and-forget: reencaminha payload cru para o N8N do cliente (se configurado)
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: wa } = await supabaseAdmin
            .from("whatsapp_numbers")
            .select("n8n_webhook_url, n8n_webhook_auth_header, workspace_id")
            .eq("id", params.numberId)
            .maybeSingle();

          const url = wa?.n8n_webhook_url?.trim();
          if (url) {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const auth = wa?.n8n_webhook_auth_header?.trim();
            if (auth) headers["Authorization"] = auth;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            fetch(url, { method: "POST", headers, body: raw, signal: controller.signal })
              .then(async (res) => {
                clearTimeout(timeout);
                if (!res.ok) {
                  await supabaseAdmin.from("evolution_error_logs").insert({
                    workspace_id: wa.workspace_id,
                    whatsapp_number_id: params.numberId,
                    kind: "n8n_forward",
                    message: `N8N respondeu ${res.status}`,
                    metadata: { url, status: res.status },
                  });
                }
              })
              .catch(async (err) => {
                clearTimeout(timeout);
                await supabaseAdmin.from("evolution_error_logs").insert({
                  workspace_id: wa.workspace_id,
                  whatsapp_number_id: params.numberId,
                  kind: "n8n_forward",
                  message: err instanceof Error ? err.message : "N8N forward failed",
                  metadata: { url },
                }).then(() => {}, () => {});
              });
          }
        } catch {
          // Falha ao carregar config não pode quebrar o processamento do CRM
        }

        try {
          const { processEvolutionPayload } = await import("@/lib/evolution-message-processor.server");
          const stats = await processEvolutionPayload(params.numberId, payload, { touchWebhook: true, source: "webhook" });
          return Response.json({ ok: true, ...stats });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "webhook error", { status: 500 });
        }
      },
    },
  },
});
