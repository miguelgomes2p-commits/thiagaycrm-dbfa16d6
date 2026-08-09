import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

export const Route = createFileRoute("/api/public/hooks/drain-n8n-deliveries")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async () => {
        const startedAt = Date.now();
        const { drainN8nDeliveries } = await import("@/lib/n8n-delivery.server");
        const result = await drainN8nDeliveries(50);
        return Response.json({ ok: true, ...result, duration_ms: Date.now() - startedAt }, { headers: corsHeaders });
      },
    },
  },
});
