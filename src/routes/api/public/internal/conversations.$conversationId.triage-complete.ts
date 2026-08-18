import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

function log(event: string, data: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "triage_complete", event, ts: new Date().toISOString(), ...data }));
}

export const Route = createFileRoute("/api/public/internal/conversations/$conversationId/triage-complete")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request, params }) => {
       try {
        log("TRIAGE_COMPLETE_REQUEST_RECEIVED", { conversation_id: params.conversationId });
        const secret = process.env["N8N_INTERNAL_API_SECRET"]?.trim();
        const auth = (request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "").trim();
        const bearerDetected = /^bearer\s+/i.test(auth);
        const token = bearerDetected ? auth.replace(/^bearer\s+/i, "").trim() : "";

        if (!secret || !token || !timingSafeEqual(token, secret)) {
          log("AUTH_FAILED", {
            conversation_id: params.conversationId,
            authorization_present: auth.length > 0,
            bearer_detected: bearerDetected,
            received_token_length: token.length,
            expected_secret_configured: Boolean(secret),
            expected_token_length: secret?.length ?? 0,
            host: request.headers.get("host"),
          });
          return Response.json(
            {
              success: false,
              error: !secret ? "server_secret_not_configured" : "unauthorized",
              diagnostics: {
                authorization_present: auth.length > 0,
                bearer_detected: bearerDetected,
                received_token_length: token.length,
                expected_secret_configured: Boolean(secret),
                expected_token_length: secret?.length ?? 0,
              },
            },
            { status: !secret ? 500 : 401, headers: corsHeaders },
          );
        }

        const conversationId = params.conversationId;
        if (!UUID_RE.test(conversationId)) {
          return Response.json({ success: false, error: "conversation_not_found" }, { status: 404, headers: corsHeaders });
        }

        let body: { event?: string; source?: string; ai_summary?: string; qualification_status?: string } = {};
        try {
          const raw = await request.text();
          if (raw) body = JSON.parse(raw);
        } catch {
          return Response.json({ success: false, error: "invalid_json" }, { status: 400, headers: corsHeaders });
        }

        if (body.event && body.event !== "triage_completed") {
          return Response.json({ success: false, error: "unsupported_event" }, { status: 400, headers: corsHeaders });
        }

        const idempotencyKey = request.headers.get("idempotency-key");
        const aiSummary = typeof body.ai_summary === "string" ? body.ai_summary.slice(0, 4000) : null;

        log("TRIAGE_COMPLETED_RECEIVED", {
          conversation_id: conversationId,
          source: body.source ?? null,
          idempotency_key: idempotencyKey,
        });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("complete_triage_and_assign", {
          _conversation_id: conversationId,
          _ai_summary: aiSummary ?? undefined,
          _idempotency_key: idempotencyKey ?? undefined,
        });

        if (error) {
          log("RPC_ERROR", { conversation_id: conversationId, error: error.message });
          return Response.json({ success: false, error: "internal_error" }, { status: 500, headers: corsHeaders });
        }

        const result = (data ?? {}) as {
          success?: boolean;
          status?: string;
          error?: string;
          workspace_id?: string;
          assigned_agent?: { id: string; name: string | null };
        };

        if (result.error === "conversation_not_found") {
          log("CONVERSATION_NOT_FOUND", { conversation_id: conversationId });
          return Response.json({ success: false, error: "conversation_not_found" }, { status: 404, headers: corsHeaders });
        }

        const eventName =
          result.status === "assigned"
            ? "ROUND_ROBIN_ASSIGNED"
            : result.status === "already_assigned"
              ? "ALREADY_ASSIGNED"
              : result.status === "waiting_for_agent"
                ? "NO_ELIGIBLE_AGENT"
                : "INVALID_WORKSPACE_MODE";

        log(eventName, {
          conversation_id: conversationId,
          workspace_id: result.workspace_id ?? null,
          status: result.status ?? null,
          assigned_agent_id: result.assigned_agent?.id ?? null,
        });

        const payload: Record<string, unknown> = {
          success: result.success ?? false,
          status: result.status,
          conversation_id: conversationId,
        };
        if (result.assigned_agent) payload["assigned_agent"] = result.assigned_agent;

        const httpStatus = result.status === "waiting_for_agent" ? 202 : 200;
        log("TRIAGE_COMPLETE_RESPONSE_SENT", { conversation_id: conversationId, http_status: httpStatus });
        return Response.json(payload, { status: httpStatus, headers: corsHeaders });
       } catch (err) {
        const e = err as { name?: string; message?: string; code?: string; stack?: string };
        log("TRIAGE_COMPLETE_ERROR", {
          conversation_id: params.conversationId,
          error_name: e?.name ?? "Error",
          error_code: e?.code ?? null,
          error_message: e?.message ?? String(err),
          stack: e?.stack ?? null,
        });
        return Response.json(
          { success: false, error: "internal_error", code: e?.code ?? "unhandled_exception" },
          { status: 500, headers: corsHeaders },
        );
       }
      },
    },
  },
});
