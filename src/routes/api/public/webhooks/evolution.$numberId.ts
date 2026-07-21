import { createFileRoute } from "@tanstack/react-router";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

// Evolution API POSTa eventos como { event, instance, data }.
// Eventos que tratamos:
//   MESSAGES_UPSERT / messages.upsert  -> mensagens entrando (fromMe true|false)
//   CONNECTION_UPDATE / connection.update -> state: open|connecting|close
//   QRCODE_UPDATED / qrcode.updated -> novo QR base64
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
          .select("id, workspace_id, provider, instance_name")
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
            state === "open"
              ? "connected"
              : state === "connecting"
                ? "connecting"
                : state === "close"
                  ? "disconnected"
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
            // Para grupos: usamos o JID do grupo como "waId" (identidade da conversa)
            // e o participante real (m.key.participant) como sender.
            const waId: string = remoteJid.split("@")[0];
            const participantJid: string | undefined = m.key.participant;
            const participantId = participantJid ? participantJid.split("@")[0] : undefined;
            const pushName: string | undefined = m.pushName;
            let text: string =
              m.message?.conversation ??
              m.message?.extendedTextMessage?.text ??
              m.message?.imageMessage?.caption ??
              m.message?.videoMessage?.caption ??
              (m.message?.imageMessage
                ? "📷 Imagem"
                : m.message?.audioMessage
                  ? "🎵 Áudio"
                  : m.message?.videoMessage
                    ? "🎬 Vídeo"
                    : m.message?.documentMessage
                      ? `📎 ${m.message.documentMessage?.fileName ?? "documento"}`
                      : m.message?.stickerMessage
                        ? "🌟 Sticker"
                        : m.messageType
                          ? `[${m.messageType}]`
                          : "");
            // Em grupos, prefixa com o nome de quem enviou (útil pra saber quem falou)
            if (isGroup && !fromMe && text) {
              const who = pushName ?? participantId ?? "membro";
              text = `${who}: ${text}`;
            }
            if (!text) continue;

            // Contato (ou "contato-grupo" quando for group chat)
            let contactId: string;
            const { data: exContact } = await supabaseAdmin
              .from("contacts")
              .select("id, name")
              .eq("workspace_id", num.workspace_id)
              .eq("phone", waId)
              .maybeSingle();
            if (exContact) {
              contactId = exContact.id;
              // Se o contato ainda estava com o número como nome e agora temos um pushName real
              // do próprio contato (inbound de conversa 1:1), atualiza o nome.
              if (!isGroup && !fromMe && pushName && exContact.name === waId) {
                await supabaseAdmin.from("contacts").update({ name: pushName }).eq("id", contactId);
              }
            } else {
              // NUNCA usar pushName quando fromMe=true — esse pushName é do dono do
              // WhatsApp (você), não do contato. Isso causava "todo mundo vira Miguel".
              const initialName = isGroup
                ? `Grupo ${waId.slice(-6)}`
                : !fromMe && pushName
                  ? pushName
                  : waId;
              const { data: created } = await supabaseAdmin
                .from("contacts")
                .insert({
                  workspace_id: num.workspace_id,
                  type: isGroup ? "group" : "person",
                  name: initialName,
                  phone: waId,
                })
                .select("id")
                .single();
              contactId = created!.id;
            }

            // Conversa
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

            // Mensagem (respeitando direção — o app do celular também gera eventos com fromMe=true)
            await supabaseAdmin.from("messages").insert({
              workspace_id: num.workspace_id,
              conversation_id: convId,
              direction: fromMe ? "outbound" : "inbound",
              sender_type: fromMe ? "user" : "contact",
              content: text,
              wa_message_id: m.key.id ?? null,
              delivery_status: "delivered",
            });

            await supabaseAdmin
              .from("conversations")
              .update({
                last_message_preview: text.slice(0, 200),
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
