// Server-only helpers for stage automations: send a WhatsApp text as an
// automation (no auth middleware) and dispatch a full automation for a lead
// (used by both stage_enter runs and the recurring cron).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

export async function sendWhatsappMessageInternal(params: {
  conversationId: string;
  body: string;
  senderUserId: string | null;
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

  // Assinatura "*Nome - Atendimento*" igual aos envios manuais: fica só no
  // payload enviado ao WhatsApp; o banco guarda o texto puro.
  let outgoingBody = body;
  if (senderUserId) {
    try {
      const { resolveSenderName } = await import("@/lib/sender-name.server");
      const senderName = await resolveSenderName(supabaseAdmin, senderUserId);
      outgoingBody = `*${senderName} - Atendimento*\n${body}`;
    } catch {
      outgoingBody = body;
    }
  }

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

// Full dispatch: resolve AI number + conversation + variables, render message
// and send. Returns { ok } or throws with a reason. Shared by stage_enter and
// recurring cron.
export async function dispatchStageAutomation(params: {
  automationId: string;
  leadId: string;
  senderUserId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { automationId, leadId } = params;

  const { data: automation, error: aerr } = await supabaseAdmin
    .from("stage_automations")
    .select("id, workspace_id, action_type, message, active")
    .eq("id", automationId)
    .single();
  if (aerr || !automation) return { ok: false, reason: "automation_not_found" };
  if (!automation.active) return { ok: false, reason: "inactive" };
  if (automation.action_type !== "send_whatsapp" || !automation.message) {
    return { ok: false, reason: "unsupported_action" };
  }

  const { data: lead, error: lerr } = await supabaseAdmin
    .from("leads")
    .select("id, title, value, contact_id, workspace_id, owner_id")
    .eq("id", leadId)
    .single();
  if (lerr || !lead) return { ok: false, reason: "lead_not_found" };
  if (!lead.contact_id) return { ok: false, reason: "no_contact" };

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, name, phone")
    .eq("id", lead.contact_id)
    .single();
  if (!contact?.phone) return { ok: false, reason: "no_phone" };

  const { data: aiNumbers } = await supabaseAdmin
    .from("whatsapp_numbers")
    .select("id, workspace_id")
    .eq("workspace_id", lead.workspace_id)
    .eq("is_active", true)
    .not("n8n_webhook_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const aiNumber = aiNumbers?.[0];
  if (!aiNumber) return { ok: false, reason: "no_ai_number" };

  const waId = String(contact.phone).replace(/\D+/g, "");
  if (!waId) return { ok: false, reason: "invalid_phone" };

  let convId: string | null = null;
  const { data: existingConv } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("workspace_id", lead.workspace_id)
    .eq("whatsapp_number_id", aiNumber.id)
    .eq("wa_contact_wa_id", waId)
    .maybeSingle();
  if (existingConv) {
    convId = existingConv.id;
  } else {
    const { data: createdConv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .insert({
        workspace_id: lead.workspace_id,
        contact_id: contact.id,
        channel: "whatsapp",
        status: "open",
        whatsapp_number_id: aiNumber.id,
        wa_contact_wa_id: waId,
      })
      .select("id")
      .single();
    if (convErr || !createdConv) return { ok: false, reason: "conversation_create_failed" };
    convId = createdConv.id;
  }

  const vars = {
    "contact.name": contact.name ?? "",
    "contact.phone": contact.phone ?? "",
    "lead.title": lead.title ?? "",
    "lead.value": lead.value
      ? Number(lead.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "",
  };
  const body = renderTemplate(automation.message, vars);
  if (!body.trim()) return { ok: false, reason: "empty_body" };

  await sendWhatsappMessageInternal({
    conversationId: convId!,
    body,
    senderUserId: params.senderUserId ?? lead.owner_id ?? null,
  });
  return { ok: true };
}
