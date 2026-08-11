/**
 * Automation Studio — server functions (BETA PRIVADO).
 * Todo acesso passa pelo guard `assertBeta`, que valida a allowlist no banco.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationDefinition } from "@/lib/automation-types";

type Ctx = { supabase: SupabaseClient; userId: string };

async function assertBeta(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_automation_beta", { _user_id: context.userId });
  if (error || !data) throw new Error("Recurso em beta privado. Acesso não liberado para esta conta.");
}

export const getAutomationAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as unknown as Ctx).supabase.rpc("has_automation_beta", {
      _user_id: (context as unknown as Ctx).userId,
    });
    return { allowed: !!data };
  });

export const listAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertBeta(ctx);
    const { data: rows, error } = await ctx.supabase
      .from("automations")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    workspaceId: string; id?: string | null; name: string; description?: string | null;
    definition: AutomationDefinition;
  }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertBeta(ctx);
    const payload = {
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      trigger_type: data.definition.trigger.type,
      draft_definition: data.definition,
      created_by: ctx.userId,
    };
    if (data.id) {
      const { error } = await ctx.supabase
        .from("automations")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await ctx.supabase
      .from("automations")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const publishAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertBeta(ctx);
    const { data: auto, error } = await ctx.supabase
      .from("automations")
      .select("id, workspace_id, draft_definition, published_version")
      .eq("id", data.id)
      .single();
    if (error || !auto) throw new Error("Automação não encontrada");
    const def = auto.draft_definition as unknown as AutomationDefinition | null;
    if (!def || !def.actions?.length) throw new Error("Adicione ao menos uma ação antes de publicar");

    const nextVersion = (auto.published_version ?? 0) + 1;
    const { error: verr } = await ctx.supabase.from("automation_versions").insert({
      workspace_id: auto.workspace_id,
      automation_id: auto.id,
      version: nextVersion,
      definition: def,
      trigger_type: def.trigger.type,
      published_by: ctx.userId,
    });
    if (verr) throw new Error(verr.message);

    const { error: uerr } = await ctx.supabase
      .from("automations")
      .update({
        status: "published",
        published_version: nextVersion,
        trigger_type: def.trigger.type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auto.id);
    if (uerr) throw new Error(uerr.message);
    return { version: nextVersion };
  });

export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "draft" | "published" | "paused" | "archived" }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertBeta(ctx);
    const patch: Record<string, unknown> = { status: data.status, updated_at: new Date().toISOString() };
    if (data.status === "archived") patch.archived_at = new Date().toISOString();
    const { error } = await ctx.supabase.from("automations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAutomationExecutions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { automationId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertBeta(ctx);
    const { data: rows, error } = await ctx.supabase
      .from("automation_executions")
      .select("id, status, mode, started_at, finished_at, error_message, entity_type, entity_id")
      .eq("automation_id", data.automationId)
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Simulação (dry-run): nada é enviado nem gravado no CRM. */
export const testAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; leadId?: string | null; vehicleId?: string | null; definition: AutomationDefinition }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertBeta(ctx);
    const { buildContext, evaluateConditions, executeAutomation } = await import("@/lib/automation-engine.server");
    const { ctx: engineCtx, leadId } = await buildContext({
      workspace_id: data.workspaceId,
      entity_type: data.vehicleId ? "vehicle" : "lead",
      entity_id: data.vehicleId ?? data.leadId ?? null,
      payload: {},
    });
    const matched = evaluateConditions(data.definition.conditions, engineCtx);
    if (!matched) return { matched: false, steps: [], context: engineCtx };
    const run = await executeAutomation({
      workspaceId: data.workspaceId,
      automationId: "00000000-0000-0000-0000-000000000000",
      version: 0,
      definition: data.definition,
      ctx: engineCtx,
      leadId,
      dryRun: true,
    });
    return { matched: true, steps: run.steps, context: engineCtx };
  });
