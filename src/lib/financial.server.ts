/**
 * Guards server-side do módulo Financeiro (BETA privado).
 * Regra dupla: membro do workspace E flag financial_management_beta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FinancialCtx = { supabase: SupabaseClient; userId: string };

export async function hasFinancialBeta(ctx: FinancialCtx): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("has_financial_beta", { _user_id: ctx.userId });
  return !error && !!data;
}

export async function assertFinancialBeta(ctx: FinancialCtx) {
  if (!(await hasFinancialBeta(ctx))) {
    throw new Error("Recurso em beta privado. Acesso não liberado para esta conta.");
  }
}

export async function assertWorkspaceMember(ctx: FinancialCtx, workspaceId: string) {
  const { data } = await ctx.supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new Error("Sem acesso a este workspace.");
}

export async function assertVehicleAccess(ctx: FinancialCtx, vehicleId: string): Promise<string> {
  const { data } = await ctx.supabase.from("vehicles").select("workspace_id").eq("id", vehicleId).maybeSingle();
  if (!data) throw new Error("Veículo não encontrado.");
  const workspaceId = (data as { workspace_id: string }).workspace_id;
  await assertWorkspaceMember(ctx, workspaceId);
  return workspaceId;
}
