/**
 * Financeiro (BETA privado) — server functions.
 * Todo acesso passa por requireSupabaseAuth + assertFinancialBeta + workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertFinancialBeta, assertVehicleAccess, assertWorkspaceMember, hasFinancialBeta, type FinancialCtx,
} from "@/lib/financial.server";
import type { FinancialOverview } from "@/lib/financial";

export const getFinancialAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ allowed: await hasFinancialBeta(context as unknown as FinancialCtx) }));

export const getVehicleFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vehicleId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as FinancialCtx;
    await assertFinancialBeta(ctx);
    await assertVehicleAccess(ctx, data.vehicleId);
    const [fin, exp, audit] = await Promise.all([
      ctx.supabase.from("vehicle_financials").select("*").eq("vehicle_id", data.vehicleId).maybeSingle(),
      ctx.supabase.from("vehicle_expenses").select("*").eq("vehicle_id", data.vehicleId)
        .order("expense_date", { ascending: true }),
      ctx.supabase.from("vehicle_financial_audit").select("*").eq("vehicle_id", data.vehicleId)
        .order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      financial: fin.data ?? null,
      expenses: exp.data ?? [],
      audit: audit.data ?? [],
    };
  });

export const saveVehicleFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    vehicleId: string;
    acquisitionCost?: number | null;
    acquiredAt?: string | null;
    saleAmount?: number | null;
    saleDate?: string | null;
    soldToLeadId?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as FinancialCtx;
    await assertFinancialBeta(ctx);
    const workspaceId = await assertVehicleAccess(ctx, data.vehicleId);
    const payload = {
      vehicle_id: data.vehicleId,
      workspace_id: workspaceId,
      acquisition_cost: data.acquisitionCost ?? null,
      acquired_at: data.acquiredAt || null,
      sale_amount: data.saleAmount ?? null,
      sale_date: data.saleDate || null,
      sold_to_lead_id: data.soldToLeadId || null,
      notes: data.notes ?? null,
      created_by: ctx.userId,
    };
    const { error } = await ctx.supabase
      .from("vehicle_financials")
      .upsert(payload as never, { onConflict: "vehicle_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addVehicleExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    vehicleId: string; category: string; amount: number; expenseDate: string; description?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as FinancialCtx;
    await assertFinancialBeta(ctx);
    const workspaceId = await assertVehicleAccess(ctx, data.vehicleId);
    if (!(data.amount > 0)) throw new Error("Informe um valor maior que zero.");
    const { error } = await ctx.supabase.from("vehicle_expenses").insert({
      workspace_id: workspaceId,
      vehicle_id: data.vehicleId,
      category: data.category,
      amount: data.amount,
      expense_date: data.expenseDate,
      description: data.description ?? null,
      created_by: ctx.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Soft delete: despesa é cancelada, nunca removida do histórico. */
export const cancelVehicleExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { expenseId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as FinancialCtx;
    await assertFinancialBeta(ctx);
    const { data: row } = await ctx.supabase
      .from("vehicle_expenses").select("workspace_id").eq("id", data.expenseId).maybeSingle();
    if (!row) throw new Error("Despesa não encontrada.");
    await assertWorkspaceMember(ctx, (row as { workspace_id: string }).workspace_id);
    const { error } = await ctx.supabase
      .from("vehicle_expenses").update({ status: "cancelled" } as never).eq("id", data.expenseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFinancialOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; from: string; to: string }) => input)
  .handler(async ({ data, context }): Promise<FinancialOverview> => {
    const ctx = context as unknown as FinancialCtx;
    await assertFinancialBeta(ctx);
    await assertWorkspaceMember(ctx, data.workspaceId);
    const { data: overview, error } = await ctx.supabase.rpc("financial_overview", {
      _workspace_id: data.workspaceId, _from: data.from, _to: data.to,
    });
    if (error) throw new Error(error.message);
    return overview as unknown as FinancialOverview;
  });
