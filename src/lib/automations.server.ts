// Server-only helper: send a WhatsApp text message as if it were a user-authored
// outbound message, but from an automation context (no auth middleware).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function sendWhatsappMessageInternal(params: {
  conversationId: string;
  body: string;
  senderUserId: string;
}) {
  const { conversationId, body, senderUserId } = params;

  const { data: conv, error: cerr } = await supabaseAdmin
    .from("conversations")
    .select("id, workspace_id, whatsapp_number_id, wa_contact_wa_id, contact_id")
    .eq("id", conversationId)
    .single();
  if (cerr || !conv) throw new Error("Conversa não encontrada");
  if (!conv.whatsapp_number_id || !conv.wa_contact_wa_id) {
    throw new Error("Conversa sem número/contato WhatsApp vinculado");
  }

  const { data: num, error: nerr } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, provider, phone_number_id, access_token, provider_base_url, provider_api_key, instance_name")
    .eq("id", conv.whatsapp_number_id)
    .eq("workspace_id", conv.workspace_id)
    .single();
  if (nerr || !num) throw new Error("Número WhatsApp não encontrado");

  const nowIso = new Date().toISOString();
  const { data: pendingMsg, error: perr } = await supabaseAdmin
    .from("messages")
    .insert({
      workspace_id: conv.workspace_id,
      conversation_id: conv.id,
      direction: "outbound",
      sender_type: "user",
      sender_user_id: senderUserId,
      content: body,
      delivery_status: "pending",
      created_at: nowIso,
    })
    .select()
    .single();
  if (perr || !pendingMsg) throw new Error(perr?.message ?? "Falha ao registrar mensagem");

  await supabaseAdmin
    .from("conversations")
    .update({ last_message_preview: body.slice(0, 200), last_message_at: nowIso })
    .eq("id", conv.id);

  try {
    let waId: string | null = null;
    if (num.provider === "cloud_api") {
      if (!num.phone_number_id || !num.access_token) throw new Error("Credenciais Cloud API ausentes.");
      const { sendWaText } = await import("@/lib/whatsapp.server");
      const resp = await sendWaText(num.phone_number_id, num.access_token, conv.wa_contact_wa_id, body);
      waId = resp.messages?.[0]?.id ?? null;
    } else if (num.provider === "evolution") {
      if (!num.provider_base_url || !num.provider_api_key || !num.instance_name) {
        throw new Error("Configuração Evolution ausente.");
      }
      const { evolutionSendText } = await import("@/lib/evolution.server");
      const resp = await evolutionSendText(
        num.provider_base_url,
        num.provider_api_key,
        num.instance_name,
        conv.wa_contact_wa_id,
        body,
      );
      waId = resp.key?.id ?? null;
    } else {
      throw new Error(`Provedor ${num.provider} não implementado`);
    }
    await supabaseAdmin
      .from("messages")
      .update({ wa_message_id: waId, delivery_status: "sent" })
      .eq("id", pendingMsg.id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("messages")
      .update({ delivery_status: "failed", error_message: msg })
      .eq("id", pendingMsg.id);
    throw new Error(msg);
  }
}
