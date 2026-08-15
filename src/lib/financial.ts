/**
 * Gestão Financeira do Estoque (BETA privado).
 * Serviço central de cálculo — nenhum componente deve repetir fórmulas.
 * Fonte da verdade: acquisition_cost, sale_amount e despesas ativas.
 */

export const EXPENSE_CATEGORIES = [
  "Mecânica", "Funilaria", "Pintura", "Estética", "Lavagem", "Peças", "Pneus",
  "Documentação", "Despachante", "Transporte", "Guincho", "Vistoria", "Comissão",
  "Taxas", "Outros",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number] | string;

export type VehicleExpense = {
  id: string;
  workspace_id: string;
  vehicle_id: string;
  category: string;
  description: string | null;
  amount: number;
  expense_date: string;
  status: string;
  created_at: string;
};

export type VehicleFinancialRow = {
  vehicle_id: string;
  workspace_id: string;
  acquisition_cost: number | null;
  acquired_at: string | null;
  sale_amount: number | null;
  sale_date: string | null;
  sold_to_lead_id: string | null;
  notes: string | null;
};

export type VehicleFinancials = {
  acquisitionCost: number;
  askingPrice: number;
  saleAmount: number | null;
  expensesTotal: number;
  totalCost: number;
  grossProfit: number | null;
  realProfit: number | null;
  realMargin: number | null;
  potentialProfit: number;
  potentialMargin: number;
};

export function calculateVehicleFinancials(input: {
  acquisitionCost?: number | null;
  askingPrice?: number | null;
  saleAmount?: number | null;
  expenses?: Array<{ amount: number; status?: string }> | number | null;
}): VehicleFinancials {
  const acquisitionCost = Number(input.acquisitionCost ?? 0);
  const askingPrice = Number(input.askingPrice ?? 0);
  const saleAmount = input.saleAmount == null ? null : Number(input.saleAmount);
  const expensesTotal = typeof input.expenses === "number"
    ? Number(input.expenses ?? 0)
    : (input.expenses ?? [])
        .filter((e) => (e.status ?? "active") === "active")
        .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  const totalCost = acquisitionCost + expensesTotal;
  const grossProfit = saleAmount == null ? null : saleAmount - acquisitionCost;
  const realProfit = saleAmount == null ? null : saleAmount - totalCost;
  const realMargin = saleAmount == null || saleAmount === 0 ? null : ((saleAmount - totalCost) / saleAmount) * 100;
  const potentialProfit = askingPrice - totalCost;
  const potentialMargin = askingPrice > 0 ? (potentialProfit / askingPrice) * 100 : 0;

  return {
    acquisitionCost, askingPrice, saleAmount, expensesTotal, totalCost,
    grossProfit, realProfit, realMargin, potentialProfit, potentialMargin,
  };
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/** Converte "R$ 80.000,00" | "80000" em número (para gravar numeric no banco). */
export function parseMoney(input: string): number | null {
  const clean = String(input).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export type PeriodPreset = "this_month" | "last_month" | "last_30" | "this_year" | "custom";

export function periodRange(preset: PeriodPreset, custom?: { from: string; to: string }) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(from), to: iso(to) };
    }
    case "last_30": {
      const from = new Date(now); from.setDate(from.getDate() - 29);
      return { from: iso(from), to: iso(now) };
    }
    case "this_year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    case "custom":
      return { from: custom?.from || iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: custom?.to || iso(now) };
    case "this_month":
    default:
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
}

export type FinancialOverview = {
  sold: {
    count: number; revenue: number; acquisition: number; expenses: number;
    grossProfit: number; realProfit: number; avgMargin: number;
  };
  rows: Array<{
    id: string; title: string; year: number | null; acquisition: number | null; sale: number;
    expenses: number; grossProfit: number; realProfit: number; margin: number; saleDate: string | null;
  }>;
  stock: {
    count: number; acquisition: number; expenses: number; invested: number;
    asking: number; potentialProfit: number;
  };
  age: Array<{ bucket: string; count: number; invested: number }>;
};
