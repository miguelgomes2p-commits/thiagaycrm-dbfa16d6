import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const MEDIA_KEYS = ["imageMessage", "audioMessage", "videoMessage", "documentMessage", "stickerMessage"] as const;

export type EvolutionProcessStats = {
  event: string;
  rowsSeen: number;
  insertedMessages: number;
  skippedDuplicates: number;
  createdConversations: number;
  errors: number;
  durationMs: number;
  source: string;
  /** IDs internos (UUID) das conversas resolvidas/criadas neste payload. */
  conversationIds: string[];
  workspaceId: string | null;
  workspaceMode: string | null;
};

async function logProcessorIssue(params: {
  workspaceId: string;
  whatsappNumberId: string;
  operation: string;
  instanceName?: string | null;
  message: string;
  payload?: unknown;
}) {
  try {
    await supabaseAdmin.from("evolution_error_logs").insert({
      workspace_id: params.workspaceId,
      whatsapp_number_id: params.whatsappNumberId,
      operation: params.operation,
      status: null,
      error_message: params.message,
      response_body: params.payload ? JSON.stringify(params.payload).slice(0, 4000) : null,
      instance_name: params.instanceName ?? null,
    });
  } catch (e) {
    console.error("[evolution processor] failed to log issue", e);
  }
}

function extOf(mime?: string | null, fallback = "bin"): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/webm": "webm",
    "video/mp4": "mp4", "video/webm": "webm", "video/3gpp": "3gp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/zip": "zip",
    "text/plain": "txt",
  };
  const clean = mime.split(";")[0]?.trim().toLowerCase();
  return map[clean] ?? clean?.split("/")[1] ?? fallback;
}

function stripDataUrl(value?: string | null) {
  if (!value) return undefined;
  return value.includes(",") ? value.split(",").pop() : value;
}

function unwrapMessage(msg: Json | undefined): Json | undefined {
  if (!msg) return msg;
  return (
    msg.ephemeralMessage?.message ??
    msg.viewOnceMessage?.message ??
    msg.viewOnceMessageV2?.message ??
    msg.viewOnceMessageV2Extension?.message ??
    msg.deviceSentMessage?.message ??
    msg.documentWithCaptionMessage?.message ??
    msg
  );
}

function findDeep(obj: Json, predicate: (value: Json, key: string) => boolean, depth = 0): Json | undefined {
  if (!obj || typeof obj !== "object" || depth > 10) return undefined;
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) return value;
    const nested = findDeep(value, predicate, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function looksLikeMessageRow(row: Json) {
  return !!(
    row &&
    typeof row === "object" &&
    (row.key || row.remoteJid || row.remote_jid || row.chatId || row.chat_id || row.id || row.messageId || row.message_id) &&
    (row.message || row.messageType || row.type || row.text || row.body || row.key?.remoteJid || row.remoteJid || row.remote_jid || row.chatId || row.chat_id)
  );
}

function normalizeRow(row: Json): Json {
  if (looksLikeMessageRow(row)) return row;
  if (looksLikeMessageRow(row?.message)) return row.message;
  if (looksLikeMessageRow(row?.data)) return row.data;
  if (looksLikeMessageRow(row?.messages)) return row.messages;
  return row;
}

function collectDeepMessageRows(obj: Json, depth = 0, out: Json[] = []): Json[] {
  if (!obj || typeof obj !== "object" || depth > 10) return out;
  if (Array.isArray(obj)) {
    const rows = obj.map(normalizeRow).filter(looksLikeMessageRow);
    if (rows.length > 0) out.push(...rows);
    for (const item of obj) collectDeepMessageRows(item, depth + 1, out);
    return out;
  }
  const direct = normalizeRow(obj);
  if (looksLikeMessageRow(direct)) out.push(direct);
  for (const value of Object.values(obj)) collectDeepMessageRows(value, depth + 1, out);
  return out;
}

function normalizeEvent(payload: Json): string {
  const raw = payload.event ?? payload.type ?? payload.eventType ?? payload.data?.event ?? payload.data?.type ?? "";
  return String(raw).toLowerCase().replace(/_/g, ".");
}

function mapAckStatus(raw: string | number): "sent" | "delivered" | "read" | null {
  const s = String(raw).toUpperCase();
  if (s === "READ" || s === "PLAYED" || s === "4" || s === "5") return "read";
  if (s === "DELIVERY_ACK" || s === "DELIVERED" || s === "3") return "delivered";
  if (s === "SERVER_ACK" || s === "SENT" || s === "2" || s === "1") return "sent";
  return null;
}

function deliveryRank(status: string | null | undefined): number {
  switch (status) {
    case "read": return 4;
    case "delivered": return 3;
    case "sent": return 2;
    case "pending": return 1;
    case "failed": return 0;
    default: return 0;
  }
}

function extractStatusUpdates(payload: Json): Array<{ id: string; status: string }> {
  const out: Array<{ id: string; status: string }> = [];
  const visit = (node: Json, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
    const id: string | undefined = node.keyId ?? node.key?.id ?? node.messageId ?? node.id;
    const status: string | number | undefined = node.status ?? node.ack ?? node.messageStatus;
    if (id && status !== undefined && status !== null) {
      out.push({ id: String(id), status: String(status) });
    }
    for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(payload);
  return out;
}

function extractMessageRows(payload: Json): Json[] {
  const candidates = [
    payload.data?.messages?.records,
    payload.messages?.records,
    payload.data?.records,
    payload.records,
    payload.data?.messages,
    payload.messages,
    payload.message,
    payload.data,
    payload.data?.message,
    payload.data?.data,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const rows = (Array.isArray(candidate) ? candidate : [candidate]).map(normalizeRow).filter(looksLikeMessageRow);
    if (rows.length > 0) return dedupeRows(rows);
  }
  return dedupeRows(collectDeepMessageRows(payload));
}

function dedupeRows(rows: Json[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyOf(row);
    const signature = String(key.id ?? "") + "|" + String(key.remoteJid ?? "") + "|" + String(row.messageTimestamp ?? row.timestamp ?? "");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function keyOf(m: Json): Json {
  const key = m.key ?? {};
  return {
    id: key.id ?? m.id ?? m.messageId ?? m.message_id,
    remoteJid: key.remoteJid ?? key.remote_jid ?? m.remoteJid ?? m.remote_jid ?? m.chatId ?? m.chat_id ?? m.from ?? m.to,
    fromMe: key.fromMe ?? key.from_me ?? m.fromMe ?? m.from_me,
    participant: key.participant ?? m.participant,
  };
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function toUnixSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return toUnixSeconds(numeric);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  if (typeof value === "object") {
    const v = value as { low?: unknown; high?: unknown; seconds?: unknown; _seconds?: unknown };
    if (v.seconds !== undefined) return toUnixSeconds(v.seconds);
    if (v._seconds !== undefined) return toUnixSeconds(v._seconds);
    if (typeof v.low === "number") {
      const high = typeof v.high === "number" ? v.high : 0;
      const combined = high * 4294967296 + (v.low >>> 0);
      return toUnixSeconds(combined);
    }
  }
  return null;
}

function messageTimestampSeconds(m: Json): number | null {
  return toUnixSeconds(m.messageTimestamp ?? m.timestamp ?? m.message_timestamp ?? m.dateTime ?? m.createdAt ?? m.created_at);
}

function isProcessableWaId(waId: string) {
  const digits = waId.replace(/\D/g, "");
  if (digits !== waId) return false;
  if (waId === "0") return false;
  return digits.length >= 8;
}

function detectMediaKind(m: Json): { key: (typeof MEDIA_KEYS)[number] | null; type: string | null; mime: string | null; caption: string | null; filename: string | null; inner: Json | undefined } {
  const inner = unwrapMessage(m.message);
  for (const k of MEDIA_KEYS) {
    const node = inner?.[k] ?? m.message?.[k] ?? findDeep(m, (_value, key) => key === k);
    if (node) {
      const type =
        k === "imageMessage" ? "image"
        : k === "audioMessage" ? "audio"
        : k === "videoMessage" ? "video"
        : k === "stickerMessage" ? "sticker"
        : "document";
      return { key: k, type, mime: node.mimetype ?? m.mimetype ?? null, caption: node.caption ?? null, filename: node.fileName ?? node.file_name ?? m.fileName ?? null, inner };
    }
  }
  const rawType = String(m.messageType ?? m.type ?? m.mediaType ?? "").toLowerCase();
  const inferred = rawType.includes("image") ? "image"
    : rawType.includes("audio") || rawType.includes("ptt") ? "audio"
    : rawType.includes("video") ? "video"
    : rawType.includes("document") ? "document"
    : rawType.includes("sticker") ? "sticker"
    : null;
  if (inferred) {
    const mime = m.mimetype ?? findDeep(m, (value, key) => key === "mimetype" && typeof value === "string");
    return { key: null, type: inferred, mime: typeof mime === "string" ? mime : null, caption: m.caption ?? null, filename: m.fileName ?? m.file_name ?? null, inner };
  }
  return { key: null, type: null, mime: null, caption: null, filename: null, inner };
}

function messageText(m: Json, media: ReturnType<typeof detectMediaKind>) {
  return (
    media.inner?.conversation ??
    media.inner?.extendedTextMessage?.text ??
    m.message?.conversation ??
    m.message?.extendedTextMessage?.text ??
    m.text ??
    m.body ??
    m.caption ??
    media.caption ??
    (media.type === "image" ? "📷 Imagem"
      : media.type === "audio" ? "🎵 Áudio"
      : media.type === "video" ? "🎬 Vídeo"
      : media.type === "sticker" ? "🌟 Sticker"
      : media.type === "document" ? `📎 ${media.filename ?? "documento"}`
      : m.messageType ? `[${m.messageType}]` : "")
  );
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function processEvolutionPayload(numberId: string, payload: Json, opts: { touchWebhook?: boolean; source?: string } = {}): Promise<EvolutionProcessStats> {
  const startedAt = Date.now();
  const source = opts.source ?? "webhook";
  const traceId = typeof payload?._crm_trace === "object" && payload._crm_trace && typeof payload._crm_trace.trace_id === "string"
    ? payload._crm_trace.trace_id
    : crypto.randomUUID();
  console.info(JSON.stringify({ scope: "evolution_processor", event: "start", trace_id: traceId, whatsapp_number_id: numberId, source, ts: new Date().toISOString() }));
  const { data: num } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, workspace_id, provider, instance_name, provider_base_url, provider_api_key, last_webhook_at")
    .eq("id", numberId)
    .maybeSingle();
  if (!num || num.provider !== "evolution") throw new Error("Número Evolution não encontrado");

  const { data: wsRow } = await supabaseAdmin
    .from("workspaces")
    .select("name, workspace_mode")
    .eq("id", num.workspace_id)
    .maybeSingle();
  const workspaceName = (wsRow?.name ?? "").trim().toLowerCase();
  const isPlaceholderName = (current: string | null | undefined, waId: string) => {
    const n = (current ?? "").trim();
    if (!n) return true;
    if (n === waId) return true;
    if (/^\+?\d[\d\s\-()]*$/.test(n)) return true;
    if (workspaceName && n.toLowerCase() === workspaceName) return true;
    if (n.toLowerCase().startsWith("grupo ")) return false;
    return false;
  };

  const event = normalizeEvent(payload);
  const stats: EvolutionProcessStats = { event, rowsSeen: 0, insertedMessages: 0, skippedDuplicates: 0, createdConversations: 0, errors: 0, durationMs: 0, source, conversationIds: [], workspaceId: num.workspace_id, workspaceMode: (wsRow?.workspace_mode as string | undefined) ?? null };
  const trackConversation = (id: string) => {
    if (id && !stats.conversationIds.includes(id)) stats.conversationIds.push(id);
  };

  if (event === "connection.update") {
    const state: string = payload.data?.state ?? payload.data?.instance?.state ?? payload.instance?.state ?? "";
    const mapped = state === "open" ? "connected" : state === "connecting" ? "connecting" : state === "close" ? "disconnected" : null;
    if (mapped) await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: mapped }).eq("id", num.id);
    stats.durationMs = Date.now() - startedAt;
    return stats;
  }

  if (event === "qrcode.updated") {
    const qr: string | undefined = payload.data?.qrcode?.base64 ?? payload.data?.base64 ?? payload.qrcode?.base64;
    if (qr) {
      await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: "qr", last_qr: qr, last_qr_at: new Date().toISOString() }).eq("id", num.id);
    }
    stats.durationMs = Date.now() - startedAt;
    return stats;
  }

  const isSendEvent = event === "send.message";
  if (event === "messages.update" || event === "message.update" || isSendEvent) {
    const updates = extractStatusUpdates(payload);
    for (const u of updates) {
      if (!u.id || !u.status) continue;
      const mapped = mapAckStatus(u.status);
      if (!mapped) continue;
      const { data: existing } = await supabaseAdmin
        .from("messages")
        .select("id, delivery_status")
        .eq("workspace_id", num.workspace_id)
        .eq("wa_message_id", u.id)
        .maybeSingle();
      if (!existing) continue;
      if (deliveryRank(mapped) <= deliveryRank(existing.delivery_status)) continue;
      await supabaseAdmin.from("messages").update({ delivery_status: mapped }).eq("id", existing.id);
    }
    if (opts.touchWebhook) {
      const lastTs = num.last_webhook_at ? new Date(num.last_webhook_at).getTime() : 0;
      if (Date.now() - lastTs > 60_000) {
        await supabaseAdmin.from("whatsapp_numbers").update({ last_webhook_at: new Date().toISOString() }).eq("id", num.id);
      }
    }
    // send.message carrega a mensagem completa enviada via API (n8n/automações):
    // seguimos para a ingestão normal para que ela apareça no chat do CRM.
    if (!isSendEvent) {
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }
  }

  const msgs = extractMessageRows(payload);
  stats.rowsSeen = msgs.length;
  if (opts.touchWebhook && msgs.length > 0) {
    const lastTs = num.last_webhook_at ? new Date(num.last_webhook_at).getTime() : 0;
    if (Date.now() - lastTs > 60_000) {
      await supabaseAdmin.from("whatsapp_numbers").update({ last_webhook_at: new Date().toISOString() }).eq("id", num.id);
    }
  }
  if (msgs.length === 0) {
    // Só logamos "noMessages" para eventos do webhook real (ruído puro para syncs manuais/auto).
    if (event.includes("message") && source !== "manualSync" && source !== "workspaceAutoSync") {
      await logProcessorIssue({
        workspaceId: num.workspace_id,
        whatsappNumberId: num.id,
        operation: `${opts.source ?? "webhook"}.noMessages`,
        instanceName: num.instance_name,
        message: `Evento ${event || "sem tipo"} recebido sem mensagens processáveis`,
        payload,
      });
    }
    stats.durationMs = Date.now() - startedAt;
    return stats;
  }

  // Batch dedup: 1 SELECT em vez de N (crítico para MESSAGES_SET com histórico grande).
  const incomingIds = msgs.map((m) => keyOf(m).id).filter((v): v is string => typeof v === "string" && v.length > 0);
  const existingIds = new Set<string>();
  if (incomingIds.length > 0) {
    const { data: existingRows } = await supabaseAdmin
      .from("messages")
      .select("wa_message_id")
      .eq("workspace_id", num.workspace_id)
      .in("wa_message_id", incomingIds);
    for (const r of existingRows ?? []) if (r.wa_message_id) existingIds.add(r.wa_message_id);
  }

  const HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const cutoffSec = Math.floor((Date.now() - HISTORY_WINDOW_MS) / 1000);
  const isHistorySync = event === "messages.set" || source === "manualSync" || source === "workspaceAutoSync";

  // Batch prefetch de contatos e conversas para eliminar N+1 (crítico para MESSAGES_SET
  // com histórico grande: reduz 2*N SELECTs para 2 SELECTs).
  const candidateWaIds = new Set<string>();
  for (const m of msgs) {
    const k = keyOf(m);
    const jid = String(k?.remoteJid ?? "");
    if (!jid || jid.includes("status@") || jid.endsWith("@lid") || jid.endsWith("@g.us")) continue;
    const wid = jid.split("@")[0];
    if (isProcessableWaId(wid)) candidateWaIds.add(wid);
  }
  const contactByPhone = new Map<string, { id: string; name: string | null; avatar_url: string | null }>();
  const convByWaId = new Map<string, { id: string; last_message_at: string | null }>();
  if (candidateWaIds.size > 0) {
    const waIdArr = Array.from(candidateWaIds);
    const [{ data: preContacts }, { data: preConvs }] = await Promise.all([
      supabaseAdmin
        .from("contacts")
        .select("id, name, avatar_url, phone")
        .eq("workspace_id", num.workspace_id)
        .in("phone", waIdArr),
      supabaseAdmin
        .from("conversations")
        .select("id, last_message_at, wa_contact_wa_id")
        .eq("workspace_id", num.workspace_id)
        .eq("whatsapp_number_id", num.id)
        .in("wa_contact_wa_id", waIdArr),
    ]);
    for (const c of preContacts ?? []) {
      if (c.phone) contactByPhone.set(c.phone, { id: c.id, name: c.name ?? null, avatar_url: c.avatar_url ?? null });
    }
    for (const c of preConvs ?? []) {
      if (c.wa_contact_wa_id) convByWaId.set(c.wa_contact_wa_id, { id: c.id, last_message_at: c.last_message_at ?? null });
    }
  }

  for (const m of msgs) {
    const key = keyOf(m);
    const remoteJid = String(key?.remoteJid ?? "");
    if (!remoteJid || remoteJid.includes("status@")) continue;
    // Skip @lid (opaque WhatsApp identifiers) — não são números roteáveis
    // e causam "Bad Request" ao tentar enviar mensagens de volta.
    if (remoteJid.endsWith("@lid")) continue;
    // Grupos removidos por decisão de produto: não ingerimos mais mensagens de @g.us.
    if (remoteJid.endsWith("@g.us")) continue;
    const fromMe = asBoolean(key.fromMe);
    const isGroup = false;
    const waId = remoteJid.split("@")[0];
    if (!isProcessableWaId(waId)) continue;
    const participantJid: string | undefined = key.participant;
    const participantId = participantJid ? participantJid.split("@")[0] : undefined;
    const pushName: string | undefined = m.pushName ?? m.pushname ?? m.push_name ?? m.name;

    // Ignora apenas mensagens antigas com timestamp válido fora da janela de 30 dias.
    // Rows sem timestamp são preservadas e recebem `now()` como fallback (Evolution/Baileys
    // às vezes omite o campo em histórico).
    const tsSec = messageTimestampSeconds(m);
    if (tsSec && tsSec < cutoffSec) {
      stats.skippedDuplicates++;
      continue;
    }
    const messageCreatedAt = tsSec ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();

    if (key.id && existingIds.has(key.id)) {
      stats.skippedDuplicates++;
      continue;
    }


    try {
      const media = detectMediaKind(m);
      let text = messageText(m, media);
      if (isGroup && !fromMe && text) text = `${pushName ?? participantId ?? "membro"}: ${text}`;
      if (!text && !media.type) continue;

      let contactId: string;
      const exContact = contactByPhone.get(waId) ?? null;
      const canCallProvider = !!(num.provider_base_url && num.provider_api_key && num.instance_name);
      const shouldFetchAvatar = !isHistorySync && source !== "webhook" && !isGroup && canCallProvider;
      const shouldFetchGroupMeta = !isHistorySync && source !== "webhook" && isGroup && canCallProvider;

      // Busca metadados do grupo (nome/foto) para eliminar "Grupo XXXXXX".
      let groupSubject: string | null = isGroup
        ? firstString(
            m.groupSubject,
            m.subject,
            m.chatName,
            m.chat_name,
            m.pushName,
            m.pushname,
            m.name,
            m.data?.groupSubject,
            m.data?.subject,
          )
        : null;
      let groupPicture: string | null = isGroup
        ? firstString(m.groupPicture, m.pictureUrl, m.profilePictureUrl, m.avatarUrl, m.data?.pictureUrl)
        : null;
      if (shouldFetchGroupMeta && (!exContact || !exContact.avatar_url || (exContact.name ?? "").startsWith("Grupo "))) {
        try {
          const { evolutionFetchGroupInfo } = await import("@/lib/evolution.server");
          const info = await evolutionFetchGroupInfo(num.provider_base_url!, num.provider_api_key!, num.instance_name!, remoteJid);
          if (info?.subject) groupSubject = info.subject;
          if (info?.pictureUrl) groupPicture = info.pictureUrl;
        } catch { /* best-effort */ }
      }

      if (exContact) {
        contactId = exContact.id;
        const patch: { name?: string; avatar_url?: string } = {};
        if (!isGroup && !fromMe && pushName && pushName !== exContact.name && isPlaceholderName(exContact.name, waId)) patch.name = pushName;
        if (isGroup && groupSubject && ((exContact.name ?? "").startsWith("Grupo ") || isPlaceholderName(exContact.name, waId))) patch.name = groupSubject;
        if (isGroup && groupPicture && !exContact.avatar_url) patch.avatar_url = groupPicture;
        if (source === "webhook" && !isHistorySync && shouldFetchAvatar && !exContact.avatar_url) {
          try {
            const { evolutionFetchProfilePic } = await import("@/lib/evolution.server");
            const pic = await evolutionFetchProfilePic(num.provider_base_url!, num.provider_api_key!, num.instance_name!, remoteJid);
            if (pic?.profilePictureUrl) patch.avatar_url = pic.profilePictureUrl;
          } catch { /* best-effort */ }
        }
        if (Object.keys(patch).length > 0) {
          await supabaseAdmin.from("contacts").update(patch).eq("id", contactId);
        }
      } else {
        let avatarUrl: string | null = groupPicture;
        if (shouldFetchAvatar) {
          try {
            const { evolutionFetchProfilePic } = await import("@/lib/evolution.server");
            const pic = await evolutionFetchProfilePic(num.provider_base_url!, num.provider_api_key!, num.instance_name!, remoteJid);
            avatarUrl = pic?.profilePictureUrl ?? null;
          } catch { /* best-effort */ }
        }
        const initialName = isGroup
          ? (groupSubject ?? `Grupo ${waId.slice(-6)}`)
          : (!fromMe && pushName ? pushName : waId);
        // UPSERT atômico: elimina race condition entre webhooks concorrentes.
        // Se dois processos chegarem juntos, o segundo recebe a linha existente
        // sem sobrescrever nome/avatar (ignoreDuplicates=true) e nós lemos o registro
        // canônico logo depois.
        const { error: upsertErr } = await supabaseAdmin
          .from("contacts")
          .upsert(
            {
              workspace_id: num.workspace_id,
              type: isGroup ? "group" : "person",
              name: initialName,
              phone: waId,
              avatar_url: avatarUrl,
            },
            { onConflict: "workspace_id,phone", ignoreDuplicates: true },
          );
        if (upsertErr) {
          stats.errors++;
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.contactUpsert`, instanceName: num.instance_name, message: upsertErr.message, payload: m });
          continue;
        }
        const { data: canonical, error: readErr } = await supabaseAdmin
          .from("contacts")
          .select("id, name, avatar_url")
          .eq("workspace_id", num.workspace_id)
          .eq("phone", waId)
          .maybeSingle();
        if (readErr || !canonical) {
          stats.errors++;
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.contactRead`, instanceName: num.instance_name, message: readErr?.message ?? "Falha ao ler contato após upsert", payload: m });
          continue;
        }
        contactId = canonical.id;
        contactByPhone.set(waId, { id: contactId, name: canonical.name ?? null, avatar_url: canonical.avatar_url ?? null });
      }


      const exConv = convByWaId.get(waId) ?? null;
      let convId: string;
      let conversationLastAt = exConv?.last_message_at ?? null;
      if (exConv) {
        convId = exConv.id;
      } else {
        // UPSERT atômico com ignoreDuplicates: se outro processo já criou a conversa,
        // não sobrescrevemos status/contact_id — apenas lemos o id canônico.
        const { error: convUpsertErr } = await supabaseAdmin
          .from("conversations")
          .upsert(
            {
              workspace_id: num.workspace_id,
              contact_id: contactId,
              channel: "whatsapp",
              status: "open",
              whatsapp_number_id: num.id,
              wa_contact_wa_id: waId,
            },
            { onConflict: "whatsapp_number_id,wa_contact_wa_id", ignoreDuplicates: true },
          );
        if (convUpsertErr) {
          stats.errors++;
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.conversationUpsert`, instanceName: num.instance_name, message: convUpsertErr.message, payload: m });
          continue;
        }
        const { data: canonicalConv, error: convReadErr } = await supabaseAdmin
          .from("conversations")
          .select("id, last_message_at")
          .eq("whatsapp_number_id", num.id)
          .eq("wa_contact_wa_id", waId)
          .maybeSingle();
        if (convReadErr || !canonicalConv) {
          stats.errors++;
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.conversationRead`, instanceName: num.instance_name, message: convReadErr?.message ?? "Falha ao ler conversa após upsert", payload: m });
          continue;
        }
        convId = canonicalConv.id;
        conversationLastAt = canonicalConv.last_message_at ?? null;
        convByWaId.set(waId, { id: convId, last_message_at: conversationLastAt });
        stats.createdConversations++;
      }

      let mediaUrl: string | null = null;
      let mediaMime: string | null = media.mime;
      if (media.type && !isHistorySync && num.provider_base_url && num.provider_api_key && num.instance_name) {
        try {
          const inlineBase64 = findDeep(m, (value, key) => (key === "base64" || key === "mediaBase64") && typeof value === "string");
          let base64: string | undefined = stripDataUrl(typeof inlineBase64 === "string" ? inlineBase64 : undefined);
          if (!base64) {
            const { evolutionGetBase64FromMedia } = await import("@/lib/evolution.server");
            const resp = await evolutionGetBase64FromMedia(num.provider_base_url, num.provider_api_key, num.instance_name, { ...m, key });
            base64 = stripDataUrl(resp.base64 ?? resp.buffer);
            if (resp.mimetype) mediaMime = resp.mimetype;
          }
          if (base64) {
            const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const ext = extOf(mediaMime, media.filename?.split(".").pop() ?? "bin");
            const path = `${num.workspace_id}/${convId}/${key.id ?? crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabaseAdmin.storage.from("wa-media").upload(path, bin, { contentType: mediaMime ?? "application/octet-stream", upsert: true });
            if (!upErr) {
              const { data: signed } = await supabaseAdmin.storage.from("wa-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
              mediaUrl = signed?.signedUrl ?? null;
            }
          }
        } catch (e) {
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.media`, instanceName: num.instance_name, message: e instanceof Error ? e.message : String(e), payload: { key, messageType: m.messageType } });
        }
      }

      const { error: msgErr } = await supabaseAdmin.from("messages").insert({
        workspace_id: num.workspace_id,
        conversation_id: convId,
        direction: fromMe ? "outbound" : "inbound",
        sender_type: fromMe ? "user" : "contact",
        content: text || null,
          created_at: messageCreatedAt,
        wa_message_id: key.id ?? null,
        delivery_status: "delivered",
        media_url: mediaUrl,
        media_type: media.type,
        media_mime_type: mediaMime,
        metadata: {
          crm_trace: {
            trace_id: traceId,
            source,
            event,
            whatsapp_number_id: num.id,
            received_at: new Date(startedAt).toISOString(),
          },
        },
      });
      if (msgErr) {
        if (msgErr.code === "23505") {
          stats.skippedDuplicates++;
          continue;
        }
        stats.errors++;
        await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.messageInsert`, instanceName: num.instance_name, message: msgErr.message, payload: m });
        continue;
      }
      stats.insertedMessages++;

      const previewText = media.type === "image" ? "📷 Imagem"
        : media.type === "audio" ? "🎵 Áudio"
        : media.type === "video" ? "🎬 Vídeo"
        : media.type === "sticker" ? "🌟 Sticker"
        : media.type === "document" ? `📎 ${media.filename ?? "Documento"}`
        : text;
      const shouldUpdatePreview = !conversationLastAt || new Date(conversationLastAt).getTime() <= new Date(messageCreatedAt).getTime();
      if (shouldUpdatePreview) {
        await supabaseAdmin.from("conversations").update({
          last_message_preview: (previewText ?? "").slice(0, 200),
          last_message_at: messageCreatedAt,
          ...(fromMe ? { unread_count: 0 } : {}),
        }).eq("id", convId);
        conversationLastAt = messageCreatedAt;
        const cached = convByWaId.get(waId);
        if (cached) cached.last_message_at = messageCreatedAt;
      }

      if (!exConv && !fromMe) {
        // Atribuição já foi feita pelo trigger tg_conversation_autoassign (usa o dono do número).
        // Aqui apenas registramos o item na fila para histórico/dashboard.
        const { data: convRow } = await supabaseAdmin
          .from("conversations")
          .select("assigned_to")
          .eq("id", convId)
          .maybeSingle();
        const agent = convRow?.assigned_to ?? null;
        // ON CONFLICT: queue_entries tem UNIQUE(conversation_id); ignora se já existe.
        await supabaseAdmin.from("queue_entries").upsert(
          { workspace_id: num.workspace_id, conversation_id: convId, assigned_to: agent, assigned_at: agent ? new Date().toISOString() : null },
          { onConflict: "conversation_id", ignoreDuplicates: true },
        );
      }

    } catch (e) {
      stats.errors++;
      await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.unexpected`, instanceName: num.instance_name, message: e instanceof Error ? e.message : String(e), payload: m });
    }
  }

  stats.durationMs = Date.now() - startedAt;
  console.info(JSON.stringify({ scope: "evolution_processor", event: "finish", trace_id: traceId, whatsapp_number_id: numberId, source, rows_seen: stats.rowsSeen, inserted_messages: stats.insertedMessages, skipped_duplicates: stats.skippedDuplicates, errors: stats.errors, duration_ms: stats.durationMs, ts: new Date().toISOString() }));
  // Métrica: registra processamentos lentos (>3s) ou com muitos rows para diagnóstico
  if (stats.durationMs > 3000 || stats.rowsSeen > 20 || stats.errors > 0) {
    console.log("[evolution processor]", JSON.stringify({ numberId, ...stats }));
  }
  if (stats.durationMs > 5000) {
    await logProcessorIssue({
      workspaceId: num.workspace_id,
      whatsappNumberId: num.id,
      operation: `${source}.slow`,
      instanceName: num.instance_name,
      message: `Processamento levou ${stats.durationMs}ms para ${stats.rowsSeen} rows (${stats.insertedMessages} novas, ${stats.skippedDuplicates} dups)`,
      payload: { event, source, stats },
    });
  }
  return stats;
}