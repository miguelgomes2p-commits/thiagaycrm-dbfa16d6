import { createFileRoute } from "@tanstack/react-router";
import { verifyMetaSignature } from "@/lib/whatsapp.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export const Route = createFileRoute("/api/public/webhooks/whatsapp/$numberId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: num } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("webhook_verify_token")
          .eq("id", params.numberId)
          .maybeSingle();

        if (mode === "subscribe" && num && token === num.webhook_verify_token) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request, params }) => {
        const raw = await request.text();
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) {
          console.error("[wa-webhook] Missing META_APP_SECRET");
          return new Response("Server misconfigured", { status: 500 });
        }
        const sig = request.headers.get("x-hub-signature-256");
        if (!verifyMetaSignature(appSecret, raw, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: num } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("id, workspace_id, phone_number_id, auto_reply_enabled, auto_reply_prompt, access_token")
          .eq("id", params.numberId)
          .maybeSingle();
        if (!num) return new Response("Unknown number", { status: 404 });

        await supabaseAdmin
          .from("whatsapp_numbers")
          .update({ last_webhook_at: new Date().toISOString() })
          .eq("id", num.id);

        let payload: Json;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        for (const entry of (payload.entry ?? []) as Json[]) {
          for (const change of (entry.changes ?? []) as Json[]) {
            const value = change.value ?? {};
            const contactProfileName: string | undefined = value.contacts?.[0]?.profile?.name;

            // Inbound messages
            for (const msg of (value.messages ?? []) as Json[]) {
              const fromWaId: string = msg.from;
              const displayName = contactProfileName ?? fromWaId;

              let contactId: string;
              const { data: exContact } = await supabaseAdmin
                .from("contacts")
                .select("id")
                .eq("workspace_id", num.workspace_id)
                .eq("phone", fromWaId)
                .maybeSingle();
              if (exContact) {
                contactId = exContact.id;
              } else {
                const { data: created } = await supabaseAdmin
                  .from("contacts")
                  .insert({ workspace_id: num.workspace_id, type: "person", name: displayName, phone: fromWaId })
                  .select("id")
                  .single();
                contactId = created!.id;
              }

              const { data: exConv } = await supabaseAdmin
                .from("conversations")
                .select("id, assigned_to")
                .eq("workspace_id", num.workspace_id)
                .eq("whatsapp_number_id", num.id)
                .eq("wa_contact_wa_id", fromWaId)
                .maybeSingle();
              const isNewConversation = !exConv;
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
                    wa_contact_wa_id: fromWaId,
                  })
                  .select("id")
                  .single();
                convId = created!.id;
              }

              let content = "";
              let mediaUrl: string | null = null;
              let mediaMime: string | null = null;
              switch (msg.type) {
                case "text":
                  content = msg.text?.body ?? "";
                  break;
                case "image":
                  content = "📷 Imagem";
                  mediaMime = msg.image?.mime_type ?? null;
                  mediaUrl = msg.image?.id ?? null;
                  break;
                case "audio":
                  content = "🎵 Áudio";
                  mediaMime = msg.audio?.mime_type ?? null;
                  mediaUrl = msg.audio?.id ?? null;
                  break;
                case "video":
                  content = "🎬 Vídeo";
                  mediaMime = msg.video?.mime_type ?? null;
                  mediaUrl = msg.video?.id ?? null;
                  break;
                case "document":
                  content = `📎 ${msg.document?.filename ?? "documento"}`;
                  mediaMime = msg.document?.mime_type ?? null;
                  mediaUrl = msg.document?.id ?? null;
                  break;
                case "button":
                  content = msg.button?.text ?? "";
                  break;
                case "interactive":
                  content = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "";
                  break;
                default:
                  content = `[${msg.type}]`;
              }

              await supabaseAdmin.from("messages").insert({
                workspace_id: num.workspace_id,
                conversation_id: convId,
                direction: "inbound",
                sender_type: "contact",
                content,
                wa_message_id: msg.id,
                delivery_status: "delivered",
                media_url: mediaUrl,
                media_mime_type: mediaMime,
              });

              await supabaseAdmin
                .from("conversations")
                .update({
                  last_message_preview: content.slice(0, 200),
                  last_message_at: new Date().toISOString(),
                })
                .eq("id", convId);

              if (isNewConversation) {
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

              // Optional auto-reply (best-effort, non-blocking failure)
              if (num.auto_reply_enabled && msg.type === "text" && content) {
                try {
                  const lovableKey = process.env.LOVABLE_API_KEY;
                  if (lovableKey) {
                    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Lovable-API-Key": lovableKey,
                      },
                      body: JSON.stringify({
                        model: "google/gemini-2.5-flash",
                        messages: [
                          {
                            role: "system",
                            content:
                              num.auto_reply_prompt ??
                              "Você é um assistente de vendas educado, breve e útil. Responda em português.",
                          },
                          { role: "user", content },
                        ],
                      }),
                    });
                    if (aiRes.ok) {
                      const j = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
                      const reply = j.choices?.[0]?.message?.content?.trim();
                      if (reply && num.phone_number_id && num.access_token) {
                        const { sendWaText } = await import("@/lib/whatsapp.server");
                        const r = await sendWaText(num.phone_number_id, num.access_token, fromWaId, reply);
                        await supabaseAdmin.from("messages").insert({
                          workspace_id: num.workspace_id,
                          conversation_id: convId,
                          direction: "outbound",
                          sender_type: "ai",
                          content: reply,
                          wa_message_id: r.messages?.[0]?.id ?? null,
                          delivery_status: "sent",
                        });
                        await supabaseAdmin
                          .from("conversations")
                          .update({
                            last_message_preview: reply.slice(0, 200),
                            last_message_at: new Date().toISOString(),
                          })
                          .eq("id", convId);
                      }
                    }
                  }
                } catch (err) {
                  console.error("[wa-webhook] auto-reply failed", err);
                }
              }
            }

            // Delivery status updates
            for (const st of (value.statuses ?? []) as Json[]) {
              const mapped =
                st.status === "sent"
                  ? "sent"
                  : st.status === "delivered"
                    ? "delivered"
                    : st.status === "read"
                      ? "read"
                      : st.status === "failed"
                        ? "failed"
                        : "sent";
              await supabaseAdmin
                .from("messages")
                .update({
                  delivery_status: mapped,
                  error_message: st.errors?.[0]?.title ?? null,
                })
                .eq("wa_message_id", st.id);
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
