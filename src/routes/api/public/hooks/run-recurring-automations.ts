import { createFileRoute } from "@tanstack/react-router";

// Cron target: runs every 1min via pg_cron. Processes due recurring
// follow-up automations (stage_automation_runs where next_run_at <= now()
// and status = 'active').
export const Route = createFileRoute("/api/public/hooks/run-recurring-automations")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler() {
  const started = Date.now();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { dispatchStageAutomation } = await import("@/lib/automations.server");

  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("stage_automation_runs")
    .select("id, automation_id, lead_id, stage_id, runs_count")
    .eq("status", "active")
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(50);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return Response.json({ ok: true, processed: 0, ms: Date.now() - started });
  }

  let processed = 0;
  let failed = 0;
  let completed = 0;
  let cancelled = 0;

  for (const run of due) {
    // Validate lead still in the same stage.
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, stage_id")
      .eq("id", run.lead_id)
      .maybeSingle();
    if (!lead || lead.stage_id !== run.stage_id) {
      await supabaseAdmin
        .from("stage_automation_runs")
        .update({ status: "cancelled", last_error: "lead_left_stage" })
        .eq("id", run.id);
      cancelled++;
      continue;
    }

    // Load automation to know interval + max
    const { data: automation } = await supabaseAdmin
      .from("stage_automations")
      .select("id, active, interval_seconds, max_runs")
      .eq("id", run.automation_id)
      .maybeSingle();
    if (!automation || !automation.active) {
      await supabaseAdmin
        .from("stage_automation_runs")
        .update({ status: "cancelled", last_error: "automation_inactive" })
        .eq("id", run.id);
      cancelled++;
      continue;
    }

    try {
      const res = await dispatchStageAutomation({
        automationId: run.automation_id,
        leadId: run.lead_id,
      });
      const newCount = run.runs_count + 1;
      const isDone = automation.max_runs != null && newCount >= automation.max_runs;
      const nextAt = isDone
        ? run.next_run_at // ignored when completed
        : new Date(Date.now() + (automation.interval_seconds ?? 3600) * 1000).toISOString();

      if (!res.ok) {
        // Non-fatal: still consume the slot so we don't hammer, but log reason.
        await supabaseAdmin
          .from("stage_automation_runs")
          .update({
            runs_count: newCount,
            last_run_at: new Date().toISOString(),
            next_run_at: nextAt,
            status: isDone ? "completed" : "active",
            last_error: res.reason,
          })
          .eq("id", run.id);
        failed++;
      } else {
        await supabaseAdmin
          .from("stage_automation_runs")
          .update({
            runs_count: newCount,
            last_run_at: new Date().toISOString(),
            next_run_at: nextAt,
            status: isDone ? "completed" : "active",
            last_error: null,
          })
          .eq("id", run.id);
        processed++;
        if (isDone) completed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("stage_automation_runs")
        .update({
          status: "failed",
          last_error: msg,
        })
        .eq("id", run.id);
      failed++;
    }
  }

  return Response.json({
    ok: true,
    processed,
    failed,
    completed,
    cancelled,
    total: due.length,
    ms: Date.now() - started,
  });
}
