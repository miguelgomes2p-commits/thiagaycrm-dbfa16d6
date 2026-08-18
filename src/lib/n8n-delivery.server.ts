// Entrega confiável CRM -> n8n.
// Cada webhook da Evolution vira uma linha em `n8n_deliveries` (idempotente por
// whatsapp_number_id + wa_message_id) e é entregue por um drenador dedicado com
// retry/backoff e watchdog. Nada é enviado em "fire and forget".

type Json = Record<string, unknown>;

const N8N_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 5;
// imediata -> 5s -> 20s -> 60s -> 5min -> dead_letter
const BACKOFF_SECONDS = [0, 5, 20, 60, 300];
const LOCK_TIMEOUT_MS = 60_000;

export type CrmContext = {
  conversation_id: string | null;
  workspace_id: string | null;
  workspace_mode: string | null;
};

export type EnqueueParams = {
  whatsappNumberId: string;
  payload: unknown;
  traceId?: string | null;
  requestId?: string | null;
  webhookEventId?: number | null;
  /** Contexto interno do CRM adicionado ao body enviado ao n8n (aditivo). */
  crmContext?: CrmContext | null;
  /** Nome da instância Evolution, apenas para log de diagnóstico. */
  instanceName?: string | null;
};

function logN8n(event: string, data: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "n8n_delivery", event, ts: new Date().toISOString(), ...data }));
}

function isObj(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Procura recursivamente a primeira `key` de mensagem no payload da Evolution. */
function findMessageKey(node: unknown, depth = 0): { id?: string; remoteJid?: string } | null {
  if (depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findMessageKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(node)) return null;

  const key = node["key"];
  if (isObj(key) && typeof key["id"] === "string") {
    const remote = key["remoteJid"] ?? key["remote_jid"];
    return { id: key["id"] as string, remoteJid: typeof remote === "string" ? remote : undefined };
  }

  for (const value of Object.values(node)) {
    const found = findMessageKey(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function phoneFromJid(jid?: string | null) {
  if (!jid) return null;
  const digits = jid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
  return digits && digits.length >= 8 ? digits : null;
}

function eventNameOf(payload: unknown) {
  if (!isObj(payload)) return null;
  const raw = payload["event"] ?? payload["type"];
  return typeof raw === "string" ? raw.toLowerCase().replace(/_/g, ".") : null;
}

/**
 * Registra a intenção de entrega ao n8n. Idempotente: a mesma mensagem
 * (whatsapp_number_id + wa_message_id) nunca gera duas execuções no n8n.
 */
export async function enqueueN8nDelivery(params: EnqueueParams): Promise<"skipped" | "queued" | "duplicate" | "error"> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: wa } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, n8n_webhook_url")
      .eq("id", params.whatsappNumberId)
      .maybeSingle();

    if (!wa?.n8n_webhook_url?.trim()) return "skipped";

    const key = findMessageKey(params.payload);
    const waMessageId = key?.id ?? `event:${params.webhookEventId ?? params.requestId ?? crypto.randomUUID()}`;

    // ADITIVO: o payload original da Evolution é preservado. O UUID interno fica
    // no nível principal para uso direto no n8n e também em `crm_context` para
    // manter compatibilidade com workflows que já consomem o objeto aninhado.
    const crmContext: CrmContext | null = params.crmContext
      ? {
          conversation_id: params.crmContext.conversation_id ?? null,
          workspace_id: params.crmContext.workspace_id ?? wa.workspace_id,
          workspace_mode: params.crmContext.workspace_mode ?? null,
        }
      : null;
    const bodyPayload = crmContext && isObj(params.payload)
      ? {
          ...(params.payload as Json),
          conversation_id: crmContext.conversation_id,
          workspace_id: crmContext.workspace_id,
          workspace_mode: crmContext.workspace_mode,
          crm_context: crmContext,
        }
      : params.payload;

    const { error } = await supabaseAdmin.from("n8n_deliveries").insert({
      workspace_id: wa.workspace_id,
      whatsapp_number_id: wa.id,
      webhook_event_id: params.webhookEventId ?? null,
      wa_message_id: waMessageId,
      trace_id: params.traceId ?? null,
      request_id: params.requestId ?? null,
      phone: phoneFromJid(key?.remoteJid),
      event_name: eventNameOf(params.payload),
      payload: bodyPayload as never,
      status: "pending",
    } as never);

    if (error) {
      // 23505 = já existe entrega para essa mensagem -> idempotência garantida.
      if ((error as { code?: string }).code === "23505") return "duplicate";
      logN8n("enqueue_failed", { whatsapp_number_id: wa.id, wa_message_id: waMessageId, error: error.message });
      return "error";
    }

    console.info(
      JSON.stringify({
        scope: "N8N_FORWARD",
        workspace_id: crmContext?.workspace_id ?? wa.workspace_id,
        workspace_mode: crmContext?.workspace_mode ?? null,
        conversation_id: crmContext?.conversation_id ?? null,
        instance: params.instanceName ?? null,
        timestamp: new Date().toISOString(),
      }),
    );
    logN8n("queued", { whatsapp_number_id: wa.id, wa_message_id: waMessageId, trace_id: params.traceId ?? null });
    return "queued";
  } catch (err) {
    logN8n("enqueue_exception", { error: err instanceof Error ? err.message : String(err) });
    return "error";
  }
}

type DeliveryRow = {
  id: string;
  whatsapp_number_id: string | null;
  wa_message_id: string;
  trace_id: string | null;
  request_id: string | null;
  payload: unknown;
  attempts: number;
};

async function deliverOne(
  supabaseAdmin: Awaited<ReturnType<typeof getAdmin>>,
  row: DeliveryRow,
  target: { url: string; auth: string | null },
) {
  const attempt = row.attempts + 1;
  const startedAt = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-CRM-Trace-ID": row.trace_id ?? row.id,
    "X-WA-Message-ID": row.wa_message_id,
    "X-CRM-Request-ID": row.request_id ?? row.id,
    "X-CRM-Attempt": String(attempt),
  };
  if (target.auth) headers["Authorization"] = target.auth;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify(row.payload ?? {}),
      signal: controller.signal,
    });
    httpStatus = res.status;
    responseBody = (await res.text().catch(() => ""))?.slice(0, 2000) ?? null;
    if (!res.ok) errorMessage = `n8n respondeu ${res.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "falha ao chamar n8n";
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - startedAt;
  const ok = !errorMessage;

  if (ok) {
    await supabaseAdmin
      .from("n8n_deliveries")
      .update({
        status: "delivered",
        attempts: attempt,
        last_attempt_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        http_status: httpStatus,
        response_body: responseBody,
        last_error: null,
        locked_at: null,
        duration_ms: durationMs,
      })
      .eq("id", row.id);
    logN8n("delivered", { delivery_id: row.id, wa_message_id: row.wa_message_id, trace_id: row.trace_id, attempt, http_status: httpStatus, duration_ms: durationMs });
    return true;
  }

  const dead = attempt >= MAX_ATTEMPTS;
  const backoff = BACKOFF_SECONDS[Math.min(attempt, BACKOFF_SECONDS.length - 1)] ?? 300;
  await supabaseAdmin
    .from("n8n_deliveries")
    .update({
      status: dead ? "dead_letter" : "retry",
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: new Date(Date.now() + backoff * 1000).toISOString(),
      http_status: httpStatus,
      response_body: responseBody,
      last_error: errorMessage?.slice(0, 2000) ?? null,
      locked_at: null,
      duration_ms: durationMs,
    })
    .eq("id", row.id);

  logN8n(dead ? "dead_letter" : "retry_scheduled", {
    delivery_id: row.id,
    wa_message_id: row.wa_message_id,
    trace_id: row.trace_id,
    attempt,
    http_status: httpStatus,
    retry_in_s: dead ? null : backoff,
    error: errorMessage,
  });
  return false;
}

async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

export async function drainN8nDeliveries(limit = 50) {
  const supabaseAdmin = await getAdmin();

  // WATCHDOG: entregas travadas em `processing` (worker morto) voltam para a fila.
  const staleCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  const { data: revived } = await supabaseAdmin
    .from("n8n_deliveries")
    .update({ status: "retry", locked_at: null, next_retry_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("locked_at", staleCutoff)
    .select("id");
  if (revived?.length) logN8n("watchdog_revived", { count: revived.length });

  const nowIso = new Date().toISOString();
  const { data: pending } = await supabaseAdmin
    .from("n8n_deliveries")
    .select("id")
    .in("status", ["pending", "retry"])
    .lte("next_retry_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!pending?.length) return { claimed: 0, delivered: 0, failed: 0, revived: revived?.length ?? 0 };

  const { data: claimed } = await supabaseAdmin
    .from("n8n_deliveries")
    .update({ status: "processing", locked_at: new Date().toISOString() })
    .in("id", pending.map((p) => p.id))
    .in("status", ["pending", "retry"])
    .select("id, whatsapp_number_id, wa_message_id, trace_id, request_id, payload, attempts");

  const rows = (claimed ?? []) as DeliveryRow[];
  if (!rows.length) return { claimed: 0, delivered: 0, failed: 0, revived: revived?.length ?? 0 };

  // Alvos (url/auth) buscados em lote — evita N+1.
  const numberIds = Array.from(new Set(rows.map((r) => r.whatsapp_number_id).filter(Boolean) as string[]));
  const { data: numbers } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, n8n_webhook_url, n8n_webhook_auth_header")
    .in("id", numberIds);
  const targets = new Map<string, { url: string; auth: string | null }>();
  for (const n of numbers ?? []) {
    const url = n.n8n_webhook_url?.trim();
    if (url) targets.set(n.id, { url, auth: n.n8n_webhook_auth_header?.trim() || null });
  }

  let delivered = 0;
  let failed = 0;

  // Concorrência limitada para não estourar o tempo da requisição.
  const CONCURRENCY = 5;
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (index < rows.length) {
        const row = rows[index];
        index += 1;
        const target = row.whatsapp_number_id ? targets.get(row.whatsapp_number_id) : undefined;
        if (!target) {
          await supabaseAdmin
            .from("n8n_deliveries")
            .update({ status: "dead_letter", locked_at: null, last_error: "n8n_webhook_url ausente ou número removido" })
            .eq("id", row.id);
          failed += 1;
          continue;
        }
        const ok = await deliverOne(supabaseAdmin, row, target);
        if (ok) delivered += 1;
        else failed += 1;
      }
    }),
  );

  return { claimed: rows.length, delivered, failed, revived: revived?.length ?? 0 };
}
