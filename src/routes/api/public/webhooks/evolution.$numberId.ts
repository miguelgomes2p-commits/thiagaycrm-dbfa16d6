import { createFileRoute } from "@tanstack/react-router";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const MEDIA_KEYS = ["imageMessage", "audioMessage", "videoMessage", "documentMessage", "stickerMessage"] as const;

function extOf(mime?: string | null, fallback = "bin"): string {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav", "audio/webm": "webm",
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

function unwrapMessage(msg: Json | undefined): Json | undefined {
  if (!msg) return msg;
  // WhatsApp wraps some messages: ephemeral, viewOnce, deviceSent, etc.
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
  if (!obj || typeof obj !== "object" || depth > 8) return undefined;
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) return value;
    const nested = findDeep(value, predicate, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function stripDataUrl(value?: string | null) {
  if (!value) return undefined;
  return value.includes(",") ? value.split(",").pop() : value;
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
      return {
        key: k,
        type,
        mime: node.mimetype ?? null,
        caption: node.caption ?? null,
        filename: node.fileName ?? null,
        inner,
      };
    }
  }
  const rawType = String(m.messageType ?? m.type ?? "").toLowerCase();
  const inferred = rawType.includes("image") ? "image"
    : rawType.includes("audio") || rawType.includes("ptt") ? "audio"
    : rawType.includes("video") ? "video"
    : rawType.includes("document") ? "document"
    : rawType.includes("sticker") ? "sticker"
    : null;
  if (inferred) {
    const node = findDeep(m, (value, key) => key === "mimetype" && typeof value === "string");
    return { key: null, type: inferred, mime: typeof node === "string" ? node : null, caption: null, filename: null, inner };
  }
  return { key: null, type: null, mime: null, caption: null, filename: null, inner };
}


export const Route = createFileRoute("/api/public/webhooks/evolution/$numberId")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request, params }) => {
        const raw = await request.text();
        let payload: Json;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: num } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("id, workspace_id, provider, instance_name, provider_base_url, provider_api_key")
          .eq("id", params.numberId)
          .maybeSingle();
        if (!num || num.provider !== "evolution") return new Response("Unknown", { status: 404 });

        await supabaseAdmin
          .from("whatsapp_numbers")
          .update({ last_webhook_at: new Date().toISOString() })
          .eq("id", num.id);

        const eventRaw: string = payload.event ?? "";
        const event = eventRaw.toString().toLowerCase().replace(/_/g, ".");

        // ── Connection state updates ─────────────────────────────
        if (event === "connection.update") {
          const state: string = payload.data?.state ?? "";
          const mapped =
            state === "open" ? "connected"
            : state === "connecting" ? "connecting"
            : state === "close" ? "disconnected"
            : "error";
          await supabaseAdmin.from("whatsapp_numbers").update({ connection_status: mapped }).eq("id", num.id);
          return new Response("ok");
        }

        // ── QR code updates ──────────────────────────────────────
        if (event === "qrcode.updated") {
          const qr: string | undefined = payload.data?.qrcode?.base64 ?? payload.qrcode?.base64;
          if (qr) {
            await supabaseAdmin
              .from("whatsapp_numbers")
              .update({ connection_status: "qr", last_qr: qr, last_qr_at: new Date().toISOString() })
              .eq("id", num.id);
          }
          return new Response("ok");
        }

        // ── Inbound (or outbound-from-phone) messages ────────────
        if (event === "messages.upsert") {
          const msgs: Json[] = Array.isArray(payload.data) ? payload.data : [payload.data];
          for (const m of msgs) {
            if (!m?.key) continue;
            const remoteJid: string = m.key.remoteJid ?? "";
            const fromMe: boolean = !!m.key.fromMe;
            if (!remoteJid || remoteJid.includes("status@")) continue;
            const isGroup = remoteJid.endsWith("@g.us");
            const waId: string = remoteJid.split("@")[0];
            const participantJid: string | undefined = m.key.participant;
            const participantId = participantJid ? participantJid.split("@")[0] : undefined;
            const pushName: string | undefined = m.pushName;

            const media = detectMediaKind(m);
            console.log("[evolution webhook] msg", {
              id: m.key?.id,
              messageType: m.messageType,
              messageKeys: m.message ? Object.keys(m.message) : [],
              detectedMediaType: media.type,
              detectedMediaKey: media.key,
              detectedMime: media.mime,
              hasInlineBase64: !!findDeep(m, (_value, key) => key === "base64" || key === "mediaBase64"),
            });
            let text: string =
              media.inner?.conversation ??
              media.inner?.extendedTextMessage?.text ??
              m.message?.conversation ??
              m.message?.extendedTextMessage?.text ??
              media.caption ??
              (media.type === "image" ? "📷 Imagem"
                : media.type === "audio" ? "🎵 Áudio"
                : media.type === "video" ? "🎬 Vídeo"
                : media.type === "sticker" ? "🌟 Sticker"
                : media.type === "document" ? `📎 ${media.filename ?? "documento"}`
                : m.messageType ? `[${m.messageType}]` : "");
            if (isGroup && !fromMe && text) {
              const who = pushName ?? participantId ?? "membro";
              text = `${who}: ${text}`;
            }
            if (!text && !media.key) continue;

            // ── Contact (com foto de perfil quando possível) ─────
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
              // Backfill profile picture if missing
              if (!isGroup && !exContact.avatar_url && num.provider_base_url && num.provider_api_key && num.instance_name) {
                try {
                  const { evolutionFetchProfilePic } = await import("@/lib/evolution.server");
                  let pic = await evolutionFetchProfilePic(num.provider_base_url, num.provider_api_key, num.instance_name, waId);
                  if (!pic.profilePictureUrl) {
                    pic = await evolutionFetchProfilePic(num.provider_base_url, num.provider_api_key, num.instance_name, `${waId}@s.whatsapp.net`);
                  }
                  if (pic.profilePictureUrl) {
                    await supabaseAdmin.from("contacts").update({ avatar_url: pic.profilePictureUrl }).eq("id", contactId);
                  }
                } catch { /* ignore — número sem foto ou API sem permissão */ }
              }
            } else {
              const initialName = isGroup
                ? `Grupo ${waId.slice(-6)}`
                : !fromMe && pushName ? pushName : waId;
              let avatarUrl: string | null = null;
              if (!isGroup && num.provider_base_url && num.provider_api_key && num.instance_name) {
                try {
                  const { evolutionFetchProfilePic } = await import("@/lib/evolution.server");
                  let pic = await evolutionFetchProfilePic(num.provider_base_url, num.provider_api_key, num.instance_name, waId);
                  if (!pic.profilePictureUrl) {
                    pic = await evolutionFetchProfilePic(num.provider_base_url, num.provider_api_key, num.instance_name, `${waId}@s.whatsapp.net`);
                  }
                  avatarUrl = pic.profilePictureUrl ?? null;
                } catch { /* sem foto */ }
              }
              const { data: created } = await supabaseAdmin
                .from("contacts")
                .insert({
                  workspace_id: num.workspace_id,
                  type: (isGroup ? "group" : "person") as "person" | "company",
                  name: initialName,
                  phone: waId,
                  avatar_url: avatarUrl,
                })
                .select("id")
                .single();
              contactId = created!.id;
            }

            // ── Conversation ─────────────────────────────────────
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
              const { data: created } = await supabaseAdmin
                .from("conversations")
                .insert({
                  workspace_id: num.workspace_id,
                  contact_id: contactId,
                  channel: "whatsapp",
                  status: "open",
                  whatsapp_number_id: num.id,
                  wa_contact_wa_id: waId,
                })
                .select("id")
                .single();
              convId = created!.id;
            }

            // ── Media: baixa base64 e sobe no storage ────────────
            let mediaUrl: string | null = null;
            let mediaMime: string | null = media.mime;
            if (media.type && num.provider_base_url && num.provider_api_key && num.instance_name) {
              try {
                // 1) Se o webhook veio com base64=true, o próprio payload traz
                //    m.message.base64 (Evolution v2). Se não, chama endpoint.
                const inlineBase64 = findDeep(m, (value, key) => (key === "base64" || key === "mediaBase64") && typeof value === "string");
                let base64: string | undefined = stripDataUrl(typeof inlineBase64 === "string" ? inlineBase64 : undefined);
                if (!base64) {
                  const { evolutionGetBase64FromMedia } = await import("@/lib/evolution.server");
                  const resp = await evolutionGetBase64FromMedia(num.provider_base_url, num.provider_api_key, num.instance_name, m);
                  base64 = stripDataUrl(resp.base64);
                  if (resp.mimetype) mediaMime = resp.mimetype;
                  console.log("[evolution webhook] getBase64", { id: m.key?.id, gotBase64: !!base64, mimetype: resp.mimetype });
                }
                if (base64) {
                  const bin = new Uint8Array(Buffer.from(base64, "base64"));
                  const ext = extOf(mediaMime, media.filename?.split(".").pop() ?? "bin");
                  const path = `${num.workspace_id}/${convId}/${m.key.id ?? crypto.randomUUID()}.${ext}`;
                  const { error: upErr } = await supabaseAdmin.storage
                    .from("wa-media")
                    .upload(path, bin, { contentType: mediaMime ?? "application/octet-stream", upsert: true });
                  if (upErr) {
                    console.log("[evolution webhook] upload error", upErr.message);
                  } else {
                    const { data: signed } = await supabaseAdmin.storage
                      .from("wa-media")
                      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
                    mediaUrl = signed?.signedUrl ?? null;
                    console.log("[evolution webhook] uploaded", { id: m.key?.id, path, gotSigned: !!mediaUrl });
                  }
                } else {
                  console.log("[evolution webhook] no base64 for", m.key?.id);
                }
              } catch (e) {
                console.log("[evolution webhook] media error", (e as Error).message);
              }
            }


            await supabaseAdmin.from("messages").insert({
              workspace_id: num.workspace_id,
              conversation_id: convId,
              direction: fromMe ? "outbound" : "inbound",
              sender_type: fromMe ? "user" : "contact",
              content: text || null,
              wa_message_id: m.key.id ?? null,
              delivery_status: "delivered",
              media_url: mediaUrl,
              media_type: media.type,
              media_mime_type: mediaMime,
            });

            const previewText =
              media.type === "image" ? "📷 Imagem"
              : media.type === "audio" ? "🎵 Áudio"
              : media.type === "video" ? "🎬 Vídeo"
              : media.type === "sticker" ? "🌟 Sticker"
              : media.type === "document" ? `📎 ${media.filename ?? "Documento"}`
              : text;

            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: (previewText ?? "").slice(0, 200),
                last_message_at: new Date().toISOString(),
              })
              .eq("id", convId);

            if (isNew && !fromMe) {
              const { data: agent } = await supabaseAdmin.rpc("assign_next_agent", {
                _workspace_id: num.workspace_id,
              });
              await supabaseAdmin.from("queue_entries").insert({
                workspace_id: num.workspace_id,
                conversation_id: convId,
                assigned_to: agent ?? null,
                assigned_at: agent ? new Date().toISOString() : null,
              });
              if (agent) {
                await supabaseAdmin.from("conversations").update({ assigned_to: agent }).eq("id", convId);
              }
            }
          }
          return new Response("ok");
        }

        return new Response("ignored");
      },
    },
  },
});

