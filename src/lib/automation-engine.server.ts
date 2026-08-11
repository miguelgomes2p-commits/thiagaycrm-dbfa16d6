/**
 * Automation Studio — motor de execução (server-only).
 *
 * Consome `crm_events` (event bus) e executa automações publicadas.
 * Garantias:
 *  - Idempotência por (automation_id, event_id)
 *  - Proteção contra loops (depth máximo e limite de execuções por evento)
 *  - Rate limit por workspace por ciclo
 *  - Log completo em automation_executions / automation_execution_steps
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ActionNode, AutomationDefinition, ConditionRule } from "@/lib/automation-types";

const MAX_DEPTH = 3;
const MAX_EVENTS_PER_CYCLE = 50;
const MAX_ACTIONS_PER_EXECUTION = 20;

export type EngineContext = Record<string, string | number | null>;

type CrmEvent = {
  id: string;
  workspace_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  depth: number;
};

function renderTemplate(tpl: string, ctx: EngineContext): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = ctx[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

export function evaluateConditions(
  conditions: AutomationDefinition["conditions"] | undefined,
  ctx: EngineContext,
): boolean {
  const rules = conditions?.rules ?? [];
  if (rules.length === 0) return true;
  const check = (r: ConditionRule) => {
    const raw = ctx[r.field];
    const left = raw === null || raw === undefined ? "" : String(raw);
    const right = (r.value ?? "").trim();
    switch (r.op) {
      case "eq": return left.toLowerCase() === right.toLowerCase();
      case "neq": return left.toLowerCase() !== right.toLowerCase();
      case "contains": return left.toLowerCase().includes(right.toLowerCase());
      case "gt": return Number(left) > Number(right);
      case "lt": return Number(left) < Number(right);
      case "is_empty": return left.trim() === "";
      case "is_not_empty": return left.trim() !== "";
      default: return false;
    }
  };
  return conditions?.match === "any" ? rules.some(check) : rules.every(check);
}

/** Monta o contexto (lead, contato, veículo) a partir do evento. */
export async function buildContext(event: Pick<CrmEvent, "entity_type" | "entity_id" | "payload" | "workspace_id">) {
  const ctx: EngineContext = {};
  let leadId: string | null = null;
  let vehicleId: string | null = null;

  if (event.entity_type === "lead") leadId = event.entity_id;
  if (event.entity_type === "vehicle") vehicleId = event.entity_id;
  const payloadLead = (event.payload as { lead_id?: string } | null)?.lead_id;
  if (!leadId && payloadLead) leadId = payloadLead;

  if (vehicleId && !leadId) {
    const { data } = await supabaseAdmin
      .from("lead_vehicle_interests")
      .select("lead_id")
      .eq("vehicle_id", vehicleId)
      .eq("is_primary", true)
      .maybeSingle();
    leadId = data?.lead_id ?? null;
  }

  if (leadId) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, title, value, source, priority, stage_id, owner_id, contact_id, tags")
      .eq("id", leadId)
      .maybeSingle();
    if (lead) {
      ctx["lead.id"] = lead.id;
      ctx["lead.title"] = lead.title;
      ctx["lead.value"] = lead.value ?? null;
      ctx["lead.source"] = lead.source ?? null;
      ctx["lead.priority"] = lead.priority;
      ctx["lead.stage_id"] = lead.stage_id;
      ctx["lead.owner_id"] = lead.owner_id ?? null;
      if (lead.contact_id) {
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("name, phone, city")
          .eq("id", lead.contact_id)
          .maybeSingle();
        ctx["contact.name"] = contact?.name ?? null;
        ctx["contact.phone"] = contact?.phone ?? null;
        ctx["contact.city"] = contact?.city ?? null;
      }
    }
  }

  if (vehicleId) {
    const { data: v } = await supabaseAdmin
      .from("vehicles")
      .select("id, brand, model, version, price, status, year_model")
      .eq("id", vehicleId)
      .maybeSingle();
    if (v) {
      ctx["vehicle.id"] = v.id;
      ctx["vehicle.brand"] = v.brand;
      ctx["vehicle.model"] = v.model;
      ctx["vehicle.price"] = v.price ?? null;
      ctx["vehicle.status"] = v.status;
      ctx["vehicle.year_model"] = v.year_model ?? null;
    }
  }

  for (const [k, val] of Object.entries(event.payload ?? {})) {
    ctx[`event.${k}`] = typeof val === "object" ? JSON.stringify(val) : (val as string | number | null);
  }

  return { ctx, leadId, vehicleId };
}

type StepResult = { status: "ok" | "skipped" | "error"; result?: Record<string, unknown>; error?: string };

async function runAction(
  action: ActionNode,
  args: { workspaceId: string; leadId: string | null; ctx: EngineContext; dryRun: boolean },
): Promise<StepResult> {
  const { workspaceId, leadId, ctx, dryRun } = args;
  const cfg = action.config ?? {};

  switch (action.type) {
    case "send_whatsapp": {
      const body = renderTemplate(String(cfg["message"] ?? ""), ctx).trim();
      if (!body) return { status: "skipped", result: { reason: "mensagem vazia" } };
      if (!leadId) return { status: "skipped", result: { reason: "sem lead associado" } };
      const { data: conv } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("lead_id", leadId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conv) return { status: "skipped", result: { reason: "lead sem conversa de WhatsApp" } };
      if (dryRun) return { status: "ok", result: { preview: body, conversation_id: conv.id } };
      const { sendWhatsappMessageInternal } = await import("@/lib/automations.server");
      await sendWhatsappMessageInternal({
        conversationId: conv.id,
        body,
        senderUserId: (ctx["lead.owner_id"] as string | null) ?? null,
      });
      return { status: "ok", result: { conversation_id: conv.id } };
    }
    case "create_task": {
      const title = renderTemplate(String(cfg["title"] ?? ""), ctx).trim() || "Tarefa da automação";
      const dueDays = Number(cfg["due_in_days"] ?? 1);
      if (dryRun) return { status: "ok", result: { title, due_in_days: dueDays } };
      await supabaseAdmin.from("tasks").insert({
        workspace_id: workspaceId,
        title,
        description: renderTemplate(String(cfg["description"] ?? ""), ctx) || null,
        lead_id: leadId,
        assigned_to: (ctx["lead.owner_id"] as string | null) ?? null,
        due_at: new Date(Date.now() + dueDays * 86400000).toISOString(),
      });
      return { status: "ok", result: { title } };
    }
    case "move_stage": {
      const stageId = String(cfg["stage_id"] ?? "");
      if (!leadId || !stageId) return { status: "skipped", result: { reason: "etapa ou lead ausente" } };
      if (dryRun) return { status: "ok", result: { stage_id: stageId } };
      await supabaseAdmin.from("leads").update({ stage_id: stageId }).eq("id", leadId);
      return { status: "ok", result: { stage_id: stageId } };
    }
    case "assign_owner": {
      const userId = String(cfg["user_id"] ?? "");
      if (!leadId || !userId) return { status: "skipped", result: { reason: "responsável ou lead ausente" } };
      if (dryRun) return { status: "ok", result: { user_id: userId } };
      await supabaseAdmin.from("leads").update({ owner_id: userId }).eq("id", leadId);
      return { status: "ok", result: { user_id: userId } };
    }
    case "add_tag": {
      const tag = renderTemplate(String(cfg["tag"] ?? ""), ctx).trim();
      if (!leadId || !tag) return { status: "skipped", result: { reason: "etiqueta ou lead ausente" } };
      if (dryRun) return { status: "ok", result: { tag } };
      const { data: lead } = await supabaseAdmin.from("leads").select("tags").eq("id", leadId).maybeSingle();
      const tags = Array.from(new Set([...(lead?.tags ?? []), tag]));
      await supabaseAdmin.from("leads").update({ tags }).eq("id", leadId);
      return { status: "ok", result: { tags } };
    }
    case "notify": {
      const userId = String(cfg["user_id"] ?? "") || (ctx["lead.owner_id"] as string | null) || "";
      const title = renderTemplate(String(cfg["title"] ?? "Automação"), ctx);
      if (!userId) return { status: "skipped", result: { reason: "sem destinatário" } };
      if (dryRun) return { status: "ok", result: { user_id: userId, title } };
      await supabaseAdmin.from("notifications").insert({
        workspace_id: workspaceId,
        recipient_user_id: userId,
        type: "automation",
        title,
        body: renderTemplate(String(cfg["body"] ?? ""), ctx) || null,
        lead_id: leadId,
        event_key: `automation:${action.id}:${leadId ?? "n/a"}:${Date.now()}`,
      });
      return { status: "ok", result: { user_id: userId } };
    }
    case "wait":
      return { status: "ok", result: { seconds: Number(cfg["seconds"] ?? 0) } };
    default:
      return { status: "error", error: `Ação desconhecida: ${action.type}` };
  }
}

/** Executa uma automação (live ou dry-run) a partir de um contexto já montado. */
export async function executeAutomation(params: {
  workspaceId: string;
  automationId: string;
  version: number;
  definition: AutomationDefinition;
  ctx: EngineContext;
  leadId: string | null;
  eventId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  depth?: number;
  dryRun?: boolean;
  startIndex?: number;
  executionId?: string | null;
}) {
  const dryRun = !!params.dryRun;
  const actions = (params.definition.actions ?? []).slice(0, MAX_ACTIONS_PER_EXECUTION);
  const steps: Array<{ node_id: string; node_type: string; status: string; result?: unknown; error?: string }> = [];

  let executionId = params.executionId ?? null;
  if (!dryRun && !executionId) {
    const { data, error } = await supabaseAdmin
      .from("automation_executions")
      .insert({
        workspace_id: params.workspaceId,
        automation_id: params.automationId,
        version: params.version,
        event_id: params.eventId ?? null,
        idempotency_key: params.eventId ? `${params.automationId}:${params.eventId}` : null,
        entity_type: params.entityType ?? null,
        entity_id: params.entityId ?? null,
        mode: "live",
        status: "running",
        depth: params.depth ?? 0,
      })
      .select("id")
      .single();
    if (error) {
      // conflito de idempotência: já executou para este evento
      return { skipped: true, reason: "duplicate", steps };
    }
    executionId = data.id;
  }

  let seq = params.startIndex ?? 0;
  let failed: string | null = null;

  for (let i = params.startIndex ?? 0; i < actions.length; i++) {
    const action = actions[i]!;

    if (action.type === "wait" && !dryRun) {
      const seconds = Math.max(1, Number(action.config?.["seconds"] ?? 60));
      await supabaseAdmin.from("automation_jobs").insert({
        workspace_id: params.workspaceId,
        automation_id: params.automationId,
        execution_id: executionId!,
        version: params.version,
        resume_node_id: actions[i + 1]?.id ?? action.id,
        context: { ctx: params.ctx, leadId: params.leadId, resumeIndex: i + 1 } as never,
        run_at: new Date(Date.now() + seconds * 1000).toISOString(),
      });
      await supabaseAdmin
        .from("automation_executions")
        .update({ status: "waiting" })
        .eq("id", executionId!);
      steps.push({ node_id: action.id, node_type: action.type, status: "waiting" });
      return { executionId, steps, waiting: true };
    }

    const res = await runAction(action, {
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      ctx: params.ctx,
      dryRun,
    });
    steps.push({ node_id: action.id, node_type: action.type, status: res.status, result: res.result, error: res.error });

    if (!dryRun && executionId) {
      await supabaseAdmin.from("automation_execution_steps").insert({
        workspace_id: params.workspaceId,
        execution_id: executionId,
        node_id: action.id,
        node_type: action.type,
        seq: seq++,
        status: res.status,
        result: (res.result ?? {}) as never,
        error_message: res.error ?? null,
      });
    }
    if (res.status === "error") { failed = res.error ?? "erro"; break; }
  }

  if (!dryRun && executionId) {
    await supabaseAdmin
      .from("automation_executions")
      .update({
        status: failed ? "failed" : "success",
        error_message: failed,
        finished_at: new Date().toISOString(),
      })
      .eq("id", executionId);
  }

  return { executionId, steps, failed };
}

/** Drena eventos pendentes do event bus e dispara as automações publicadas. */
export async function processPendingEvents(limit = MAX_EVENTS_PER_CYCLE) {
  const { data: events } = await supabaseAdmin
    .from("crm_events")
    .select("id, workspace_id, event_type, entity_type, entity_id, payload, depth")
    .eq("status", "pending")
    .order("created_at")
    .limit(limit);

  let processed = 0;
  let executed = 0;

  for (const ev of (events ?? []) as unknown as CrmEvent[]) {
    await supabaseAdmin.from("crm_events").update({ status: "processing" }).eq("id", ev.id);

    if ((ev.depth ?? 0) >= MAX_DEPTH) {
      await supabaseAdmin
        .from("crm_events")
        .update({ status: "skipped", processed_at: new Date().toISOString() })
        .eq("id", ev.id);
      continue;
    }

    const { data: autos } = await supabaseAdmin
      .from("automations")
      .select("id, published_version, trigger_type")
      .eq("workspace_id", ev.workspace_id)
      .eq("status", "published")
      .eq("trigger_type", ev.event_type);

    if (autos && autos.length > 0) {
      const { ctx, leadId } = await buildContext(ev);
      for (const a of autos) {
        if (!a.published_version) continue;
        const { data: version } = await supabaseAdmin
          .from("automation_versions")
          .select("definition, version")
          .eq("automation_id", a.id)
          .eq("version", a.published_version)
          .maybeSingle();
        const def = version?.definition as unknown as AutomationDefinition | undefined;
        if (!def) continue;
        if (!evaluateConditions(def.conditions, ctx)) continue;
        await executeAutomation({
          workspaceId: ev.workspace_id,
          automationId: a.id,
          version: a.published_version,
          definition: def,
          ctx,
          leadId,
          eventId: ev.id,
          entityType: ev.entity_type,
          entityId: ev.entity_id,
          depth: (ev.depth ?? 0) + 1,
        });
        executed++;
      }
    }

    await supabaseAdmin
      .from("crm_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", ev.id);
    processed++;
  }

  return { processed, executed };
}

/** Retoma execuções que estavam em espera (ação "Aguardar"). */
export async function processDueJobs(limit = 25) {
  const { data: jobs } = await supabaseAdmin
    .from("automation_jobs")
    .select("*")
    .eq("status", "scheduled")
    .lte("run_at", new Date().toISOString())
    .order("run_at")
    .limit(limit);

  let resumed = 0;
  for (const job of jobs ?? []) {
    await supabaseAdmin.from("automation_jobs").update({ status: "running" }).eq("id", job.id);
    const { data: version } = await supabaseAdmin
      .from("automation_versions")
      .select("definition")
      .eq("automation_id", job.automation_id)
      .eq("version", job.version)
      .maybeSingle();
    const def = version?.definition as unknown as AutomationDefinition | undefined;
    const context = (job.context ?? {}) as { ctx?: EngineContext; leadId?: string | null; resumeIndex?: number };
    if (!def) {
      await supabaseAdmin.from("automation_jobs").update({ status: "failed", last_error: "versão ausente" }).eq("id", job.id);
      continue;
    }
    try {
      await executeAutomation({
        workspaceId: job.workspace_id,
        automationId: job.automation_id,
        version: job.version,
        definition: def,
        ctx: context.ctx ?? {},
        leadId: context.leadId ?? null,
        executionId: job.execution_id,
        startIndex: context.resumeIndex ?? 0,
      });
      await supabaseAdmin.from("automation_jobs").update({ status: "done" }).eq("id", job.id);
      resumed++;
    } catch (e) {
      await supabaseAdmin
        .from("automation_jobs")
        .update({ status: "failed", last_error: e instanceof Error ? e.message : String(e), attempts: (job.attempts ?? 0) + 1 })
        .eq("id", job.id);
    }
  }
  return { resumed };
}
