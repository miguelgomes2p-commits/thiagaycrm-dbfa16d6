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

export async function processEvolutionPayload(numberId: string, payload: Json, opts: { touchWebhook?: boolean; source?: string } = {}): Promise<EvolutionProcessStats> {
  const { data: num } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, workspace_id, provider, instance_name, provider_base_url, provider_api_key")
    .eq("id", numberId)
    .maybeSingle();
  if (!num || num.provider !== "evolution") throw new Error("Número Evolution não encontrado");

  if (opts.touchWebhook) {
    await supabaseAdmin.from("whatsapp_numbers").update({ last_webhook_at: new Date().toISOString() }).eq("id", num.id);
  }

  const event = normalizeEvent(payload);
  const stats: EvolutionProcessStats = { event, rowsSeen: 0, insertedMessages: 0, skippedDuplicates: 0, createdConversations: 0, errors: 0 };

  if (event === "connection.update") {
    const state: string = payload.data?.state ?? payload.data?.instance?.state ?? payload.instance?.state ?? "";
    const mapped = state === "open" ? "connected" : state === "connecting" ? "connecting" : state === "close" ? "disconnected" : "error";
    await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: mapped }).eq("id", num.id);
    return stats;
  }

  if (event === "qrcode.updated") {
    const qr: string | undefined = payload.data?.qrcode?.base64 ?? payload.data?.base64 ?? payload.qrcode?.base64;
    if (qr) {
      await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: "qr", last_qr: qr, last_qr_at: new Date().toISOString() }).eq("id", num.id);
    }
    return stats;
  }

  const msgs = extractMessageRows(payload);
  stats.rowsSeen = msgs.length;
  if (msgs.length === 0) {
    if (event.includes("message")) {
      await logProcessorIssue({
        workspaceId: num.workspace_id,
        whatsappNumberId: num.id,
        operation: `${opts.source ?? "webhook"}.noMessages`,
        instanceName: num.instance_name,
        message: `Evento ${event || "sem tipo"} recebido sem mensagens processáveis`,
        payload,
      });
    }
    return stats;
  }

  for (const m of msgs) {
    const key = keyOf(m);
    const remoteJid = String(key?.remoteJid ?? "");
    if (!remoteJid || remoteJid.includes("status@")) continue;
    const fromMe = asBoolean(key.fromMe);
    const isGroup = remoteJid.endsWith("@g.us");
    const waId = remoteJid.split("@")[0];
    const participantJid: string | undefined = key.participant;
    const participantId = participantJid ? participantJid.split("@")[0] : undefined;
    const pushName: string | undefined = m.pushName ?? m.pushname ?? m.push_name ?? m.name;

    try {
      const media = detectMediaKind(m);
      let text = messageText(m, media);
      if (isGroup && !fromMe && text) text = `${pushName ?? participantId ?? "membro"}: ${text}`;
      if (!text && !media.type) continue;

      let contactId: string;
      const { data: exContact } = await supabaseAdmin
        .from("contacts")
        .select("id, name, avatar_url")
        .eq("workspace_id", num.workspace_id)
        .eq("phone", waId)
        .maybeSingle();
      if (exContact) {
        contactId = exContact.id;
        if (!isGroup && !fromMe && pushName && exContact.name === waId) {
          await supabaseAdmin.from("contacts").update({ name: pushName }).eq("id", contactId);
        }
      } else {
        const { data: created, error: cErr } = await supabaseAdmin
          .from("contacts")
          .insert({
            workspace_id: num.workspace_id,
            type: isGroup ? "group" : "person",
            name: isGroup ? `Grupo ${waId.slice(-6)}` : (!fromMe && pushName ? pushName : waId),
            phone: waId,
          })
          .select("id")
          .single();
        if (cErr || !created) {
          stats.errors++;
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.contactInsert`, instanceName: num.instance_name, message: cErr?.message ?? "Falha ao criar contato", payload: m });
          continue;
        }
        contactId = created.id;
      }

      const { data: exConv } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("workspace_id", num.workspace_id)
        .eq("whatsapp_number_id", num.id)
        .eq("wa_contact_wa_id", waId)
        .maybeSingle();
      const isNew = !exConv;
      let convId: string;
      if (exConv) {
        convId = exConv.id;
      } else {
        const { data: created, error: convErr } = await supabaseAdmin
          .from("conversations")
          .insert({ workspace_id: num.workspace_id, contact_id: contactId, channel: "whatsapp", status: "open", whatsapp_number_id: num.id, wa_contact_wa_id: waId })
          .select("id")
          .single();
        if (convErr || !created) {
          stats.errors++;
          await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.conversationInsert`, instanceName: num.instance_name, message: convErr?.message ?? "Falha ao criar conversa", payload: m });
          continue;
        }
        convId = created.id;
        stats.createdConversations++;
      }

      let mediaUrl: string | null = null;
      let mediaMime: string | null = media.mime;
      if (media.type && num.provider_base_url && num.provider_api_key && num.instance_name) {
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

      if (key.id) {
        const { data: existingMessage } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("workspace_id", num.workspace_id)
          .eq("wa_message_id", key.id)
          .maybeSingle();
        if (existingMessage) {
          stats.skippedDuplicates++;
          continue;
        }
      }

      const { error: msgErr } = await supabaseAdmin.from("messages").insert({
        workspace_id: num.workspace_id,
        conversation_id: convId,
        direction: fromMe ? "outbound" : "inbound",
        sender_type: fromMe ? "user" : "contact",
        content: text || null,
        wa_message_id: key.id ?? null,
        delivery_status: "delivered",
        media_url: mediaUrl,
        media_type: media.type,
        media_mime_type: mediaMime,
      });
      if (msgErr) {
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
      await supabaseAdmin.from("conversations").update({
        last_message_preview: (previewText ?? "").slice(0, 200),
        last_message_at: new Date().toISOString(),
        ...(fromMe ? { unread_count: 0 } : {}),
      }).eq("id", convId);

      if (isNew && !fromMe) {
        const { data: agent } = await supabaseAdmin.rpc("assign_next_agent", { _workspace_id: num.workspace_id });
        await supabaseAdmin.from("queue_entries").insert({ workspace_id: num.workspace_id, conversation_id: convId, assigned_to: agent ?? null, assigned_at: agent ? new Date().toISOString() : null });
        if (agent) await supabaseAdmin.from("conversations").update({ assigned_to: agent }).eq("id", convId);
      }
    } catch (e) {
      stats.errors++;
      await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.unexpected`, instanceName: num.instance_name, message: e instanceof Error ? e.message : String(e), payload: m });
    }
  }

  return stats;
}