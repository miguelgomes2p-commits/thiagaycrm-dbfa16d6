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
  const startedAt = Date.now();
  const source = opts.source ?? "webhook";
  const { data: num } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, workspace_id, provider, instance_name, provider_base_url, provider_api_key")
    .eq("id", numberId)
    .maybeSingle();
  if (!num || num.provider !== "evolution") throw new Error("Número Evolution não encontrado");

  const event = normalizeEvent(payload);
  const stats: EvolutionProcessStats = { event, rowsSeen: 0, insertedMessages: 0, skippedDuplicates: 0, createdConversations: 0, errors: 0, durationMs: 0, source };

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

  const msgs = extractMessageRows(payload);
  stats.rowsSeen = msgs.length;
  if (opts.touchWebhook && msgs.length > 0) {
    await supabaseAdmin.from("whatsapp_numbers").update({ last_webhook_at: new Date().toISOString() }).eq("id", num.id);
  }
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

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoffSec = Math.floor((Date.now() - SEVEN_DAYS_MS) / 1000);
  const isHistorySync = event === "messages.set" || source === "manualSync" || source === "workspaceAutoSync";

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

    // Ignora mensagens com mais de 7 dias (sincronização de histórico antigo).
    const tsSec = messageTimestampSeconds(m);
    if ((isHistorySync && !tsSec) || (tsSec && tsSec < cutoffSec)) {
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
      const { data: exContact } = await supabaseAdmin
        .from("contacts")
        .select("id, name, avatar_url")
        .eq("workspace_id", num.workspace_id)
        .eq("phone", waId)
        .maybeSingle();
      const shouldFetchAvatar =
        !isGroup && num.provider_base_url && num.provider_api_key && num.instance_name;
      if (exContact) {
        contactId = exContact.id;
        const patch: { name?: string; avatar_url?: string } = {};
        if (!isGroup && !fromMe && pushName && exContact.name === waId) patch.name = pushName;
        if (source === "webhook" && shouldFetchAvatar && !exContact.avatar_url) {
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
        let avatarUrl: string | null = null;
        if (shouldFetchAvatar) {
          try {
            const { evolutionFetchProfilePic } = await import("@/lib/evolution.server");
            const pic = await evolutionFetchProfilePic(num.provider_base_url!, num.provider_api_key!, num.instance_name!, remoteJid);
            avatarUrl = pic?.profilePictureUrl ?? null;
          } catch { /* best-effort */ }
        }
        const { data: created, error: cErr } = await supabaseAdmin
          .from("contacts")
          .insert({
            workspace_id: num.workspace_id,
            type: isGroup ? "group" : "person",
            name: isGroup ? `Grupo ${waId.slice(-6)}` : (pushName ?? waId),
            phone: waId,
            avatar_url: avatarUrl,
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
        .select("id, last_message_at")
        .eq("workspace_id", num.workspace_id)
        .eq("whatsapp_number_id", num.id)
        .eq("wa_contact_wa_id", waId)
        .maybeSingle();
      const isNew = !exConv;
      let convId: string;
      let conversationLastAt = exConv?.last_message_at ?? null;
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
      if (media.type && source !== "workspaceAutoSync" && num.provider_base_url && num.provider_api_key && num.instance_name) {
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
      const shouldUpdatePreview = !conversationLastAt || new Date(conversationLastAt).getTime() <= new Date(messageCreatedAt).getTime();
      if (shouldUpdatePreview) {
        await supabaseAdmin.from("conversations").update({
          last_message_preview: (previewText ?? "").slice(0, 200),
          last_message_at: messageCreatedAt,
          ...(fromMe ? { unread_count: 0 } : {}),
        }).eq("id", convId);
        conversationLastAt = messageCreatedAt;
      }

      if (isNew && !fromMe) {
        // Atribuição já foi feita pelo trigger tg_conversation_autoassign (usa o dono do número).
        // Aqui apenas registramos o item na fila para histórico/dashboard.
        const { data: convRow } = await supabaseAdmin
          .from("conversations")
          .select("assigned_to")
          .eq("id", convId)
          .maybeSingle();
        const agent = convRow?.assigned_to ?? null;
        await supabaseAdmin.from("queue_entries").insert({ workspace_id: num.workspace_id, conversation_id: convId, assigned_to: agent, assigned_at: agent ? new Date().toISOString() : null });
      }

    } catch (e) {
      stats.errors++;
      await logProcessorIssue({ workspaceId: num.workspace_id, whatsappNumberId: num.id, operation: `${opts.source ?? "webhook"}.unexpected`, instanceName: num.instance_name, message: e instanceof Error ? e.message : String(e), payload: m });
    }
  }

  stats.durationMs = Date.now() - startedAt;
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