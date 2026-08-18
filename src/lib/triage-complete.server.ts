type TriageBody = {
  event?: string;
  source?: string;
  ai_summary?: string;
  qualification_status?: string;
  conversation_id?: string;
  conversationId?: string;
  crm_context?: {
    conversation_id?: string;
    conversationId?: string;
  };
  json?: unknown;
  body?: unknown;
  data?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRIAGE_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
} as const;

function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }
  return diff === 0;
}

function log(event: string, data: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "triage_complete", event, ts: new Date().toISOString(), ...data }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readConversationId(value: unknown, depth = 0): string | null {
  if (!isRecord(value) || depth > 4) return null;

  const crmContext = value["crm_context"];
  if (isRecord(crmContext)) {
    const fromContext = crmContext["conversation_id"] ?? crmContext["conversationId"];
    if (typeof fromContext === "string" && fromContext.trim()) return fromContext.trim();
  }

  const direct = value["conversation_id"] ?? value["conversationId"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  for (const key of ["json", "body", "data", "payload", "input", "item"]) {
    const nested = readConversationId(value[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function json(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, { status, headers: TRIAGE_CORS_HEADERS });
}

export async function handleTriageComplete(request: Request, pathConversationId?: string) {
  let conversationIdForLog = pathConversationId ?? null;

  try {
    log("TRIAGE_COMPLETE_REQUEST_RECEIVED", { conversation_id: conversationIdForLog });

    const secret = process.env["N8N_INTERNAL_API_SECRET"]?.trim();
    const auth = (request.headers.get("authorization") ?? "").trim();
    const bearerDetected = /^bearer\s+/i.test(auth);
    const token = bearerDetected ? auth.replace(/^bearer\s+/i, "").trim() : "";

    if (!secret || !token || !timingSafeEqual(token, secret)) {
      log("AUTH_FAILED", {
        conversation_id: conversationIdForLog,
        authorization_present: auth.length > 0,
        bearer_detected: bearerDetected,
        received_token_length: token.length,
        expected_secret_configured: Boolean(secret),
        expected_token_length: secret?.length ?? 0,
        host: request.headers.get("host"),
      });
      return json(
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
        !secret ? 500 : 401,
      );
    }

    let body: TriageBody = {};
    try {
      const raw = await request.text();
      if (raw) body = JSON.parse(raw) as TriageBody;
    } catch {
      return json({ success: false, error: "invalid_json" }, 400);
    }

    const conversationId = pathConversationId?.trim() || readConversationId(body);
    conversationIdForLog = conversationId;
    if (!conversationId) {
      log("MISSING_CONVERSATION_ID", { source: body.source ?? null });
      return json({ success: false, error: "missing_conversation_id" }, 400);
    }
    if (!UUID_RE.test(conversationId)) {
      log("INVALID_CONVERSATION_ID", { conversation_id: conversationId });
      return json({ success: false, error: "invalid_conversation_id" }, 400);
    }

    if (body.event && body.event !== "triage_completed") {
      return json({ success: false, error: "unsupported_event" }, 400);
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
      return json({ success: false, error: "internal_error" }, 500);
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
      return json({ success: false, error: "conversation_not_found" }, 404);
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
    return json(payload, httpStatus);
  } catch (error) {
    const caught = error as { name?: string; message?: string; code?: string; stack?: string };
    log("TRIAGE_COMPLETE_ERROR", {
      conversation_id: conversationIdForLog,
      error_name: caught.name ?? "Error",
      error_code: caught.code ?? null,
      error_message: caught.message ?? String(error),
      stack: caught.stack ?? null,
    });
    return json(
      { success: false, error: "internal_error", code: caught.code ?? "unhandled_exception" },
      500,
    );
  }
}