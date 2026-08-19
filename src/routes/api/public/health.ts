import { createFileRoute } from "@tanstack/react-router";

// Audited source revision. The runtime environment may override this when the
// deployment provider exposes an exact commit SHA.
const AUDITED_SOURCE_SHA = "5a79bd1352ab62bf10ae10fda8529b3c659d2693";

// Minimal health endpoint. The CRM runs on Cloudflare Workers (serverless) —
// there is no persistent process memory to report; each request is isolated.
// We surface DB reachability + latency, which is what actually matters here.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const build =
          process.env["GITHUB_SHA"] ??
          process.env["COMMIT_SHA"] ??
          process.env["CF_PAGES_COMMIT_SHA"] ??
          AUDITED_SOURCE_SHA;
        let dbOk = false;
        let dbLatencyMs: number | null = null;
        let dbError: string | null = null;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const t0 = Date.now();
          const { error } = await supabaseAdmin.from("workspaces").select("id", { head: true, count: "exact" }).limit(1);
          dbLatencyMs = Date.now() - t0;
          if (error) dbError = error.message;
          else dbOk = true;
        } catch (e) {
          dbError = e instanceof Error ? e.message : String(e);
        }
        return Response.json(
          {
            ok: dbOk,
            runtime: "cloudflare-workers",
            build,
            ts: new Date().toISOString(),
            totalMs: Date.now() - started,
            db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
          },
          {
            headers: {
              "cache-control": "no-store",
              "x-lupus-build": build,
            },
          },
        );
      },
    },
  },
});
