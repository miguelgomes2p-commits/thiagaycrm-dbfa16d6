import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listStageAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ stageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("stage_automations")
      .select(
        "id, stage_id, workspace_id, name, action_type, message, delay_seconds, active, trigger_type, interval_seconds, max_runs, created_at",
      )
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
      triggerType: z.enum(["stage_enter", "recurring"]).default("stage_enter"),
      intervalSeconds: z.number().int().min(60).max(86400 * 60).optional().nullable(),
      maxRuns: z.number().int().min(1).max(100).optional().nullable(),
    }).superRefine((v, ctx) => {
      if (v.triggerType === "recurring") {
        if (!v.intervalSeconds) ctx.addIssue({ code: "custom", message: "Intervalo obrigatório para follow-up recorrente", path: ["intervalSeconds"] });
        if (!v.maxRuns) ctx.addIssue({ code: "custom", message: "Limite de envios obrigatório", path: ["maxRuns"] });
      }
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
      trigger_type: data.triggerType,
      interval_seconds: data.triggerType === "recurring" ? data.intervalSeconds! : null,
      max_runs: data.triggerType === "recurring" ? data.maxRuns! : null,
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

export const runStageAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), stageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: automations, error: aerr } = await context.supabase
      .from("stage_automations")
      .select("id, workspace_id, action_type, message, active, trigger_type, interval_seconds, max_runs")
      .eq("stage_id", data.stageId)
      .eq("active", true);
    if (aerr) throw new Error(aerr.message);
    if (!automations || automations.length === 0) return { ran: 0, skipped: 0, scheduled: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchStageAutomation } = await import("@/lib/automations.server");

    let ran = 0;
    let skipped = 0;
    let scheduled = 0;

    for (const a of automations) {
      if (a.trigger_type === "recurring") {
        // Enqueue a run; do not fire immediately — first send happens after interval.
        const nextAt = new Date(Date.now() + (a.interval_seconds ?? 3600) * 1000).toISOString();
        const { error: upErr } = await supabaseAdmin
          .from("stage_automation_runs")
          .upsert(
            {
              workspace_id: a.workspace_id,
              automation_id: a.id,
              lead_id: data.leadId,
              stage_id: data.stageId,
              runs_count: 0,
              next_run_at: nextAt,
              status: "active",
              last_error: null,
            },
            { onConflict: "automation_id,lead_id" },
          );
        if (upErr) { skipped++; continue; }
        scheduled++;
        continue;
      }
      // stage_enter — dispatch immediately
      const res = await dispatchStageAutomation({
        automationId: a.id,
        leadId: data.leadId,
        senderUserId: context.userId,
      });
      if (res.ok) ran++; else skipped++;
    }

    return { ran, skipped, scheduled };
  });
