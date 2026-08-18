import { createFileRoute } from "@tanstack/react-router";
import { handleTriageComplete, TRIAGE_CORS_HEADERS } from "@/lib/triage-complete";

export const Route = createFileRoute("/api/public/internal/conversations/triage-complete")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: TRIAGE_CORS_HEADERS }),
      POST: async ({ request }) => handleTriageComplete(request),
    },
  },
});