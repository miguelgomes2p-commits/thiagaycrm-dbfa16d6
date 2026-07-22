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

