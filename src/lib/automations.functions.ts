import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listStageAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ stageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("stage_automations")
      .select("id, stage_id, workspace_id, name, action_type, message, delay_seconds, active, created_at")
      .eq("stage_id", data.stageId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertStageAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional().nullable(),
      workspaceId: z.string().uuid(),
      stageId: z.string().uuid(),
      name: z.string().min(1).max(120),
      actionType: z.enum(["send_whatsapp"]).default("send_whatsapp"),
      message: z.string().min(1).max(4096),
      delaySeconds: z.number().int().min(0).max(86400 * 7).default(0),
      active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      workspace_id: data.workspaceId,
      stage_id: data.stageId,
      name: data.name,
      action_type: data.actionType,
      message: data.message,
      delay_seconds: data.delaySeconds,
      active: data.active,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("stage_automations")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("stage_automations")
      .insert({ ...payload, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteStageAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stage_automations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

export const runStageAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), stageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: automations, error: aerr } = await context.supabase
      .from("stage_automations")
      .select("id, workspace_id, action_type, message, delay_seconds, active")
      .eq("stage_id", data.stageId)
      .eq("active", true);
    if (aerr) throw new Error(aerr.message);
    if (!automations || automations.length === 0) return { ran: 0, skipped: 0 };

    const { data: lead, error: lerr } = await context.supabase
      .from("leads")
      .select("id, title, value, contact_id, workspace_id, owner_id")
      .eq("id", data.leadId)
      .single();
    if (lerr || !lead) throw new Error("Lead não encontrado");
    if (!lead.contact_id) return { ran: 0, skipped: automations.length, reason: "no_contact" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone")
      .eq("id", lead.contact_id)
      .single();
    if (!contact?.phone) return { ran: 0, skipped: automations.length, reason: "no_phone" };

    // Find an existing conversation for this contact
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, whatsapp_number_id, wa_contact_wa_id, workspace_id")
      .eq("workspace_id", lead.workspace_id)
      .eq("contact_id", lead.contact_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (!conv?.whatsapp_number_id) {
      return { ran: 0, skipped: automations.length, reason: "no_conversation" };
    }

    const { sendWhatsappMessageInternal } = await import("@/lib/automations.server");

    let ran = 0;
    let skipped = 0;
    const vars = {
      "contact.name": contact.name ?? "",
      "contact.phone": contact.phone ?? "",
      "lead.title": lead.title ?? "",
      "lead.value": lead.value ? Number(lead.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    };

    for (const a of automations) {
      if (a.action_type !== "send_whatsapp" || !a.message) { skipped++; continue; }
      const body = renderTemplate(a.message, vars);
      if (!body.trim()) { skipped++; continue; }
      try {
        // Note: delay_seconds is not honored in this MVP (fires immediately).
        // A full scheduler would enqueue a run row here.
        await sendWhatsappMessageInternal({
          conversationId: conv.id,
          body,
          senderUserId: context.userId,
        });
        ran++;
      } catch (e) {
        console.error("[stage-automation] failed", a.id, (e as Error).message);
        skipped++;
      }
    }

    return { ran, skipped };
  });
