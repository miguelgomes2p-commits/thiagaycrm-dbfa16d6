import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateBR, formatMoney, formatPercent } from "@/lib/financial";
import type { FinancialOverview } from "@/lib/financial";

type SortKey = "real_desc" | "margin_desc" | "margin_asc" | "cost_desc" | "sale_desc";

const SORT_LABEL: Record<SortKey, string> = {
  real_desc: "Maior lucro real",
  margin_desc: "Maior margem",
  margin_asc: "Menor margem",
  cost_desc: "Maior custo",
  sale_desc: "Maior venda",
};

export function ProfitabilityTable({ rows }: { rows: FinancialOverview["rows"] }) {
  const [sort, setSort] = useState<SortKey>("real_desc");
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      switch (sort) {
        case "margin_desc": return b.margin - a.margin;
        case "margin_asc": return a.margin - b.margin;
        case "cost_desc": return ((b.acquisition ?? 0) + b.expenses) - ((a.acquisition ?? 0) + a.expenses);
        case "sale_desc": return b.sale - a.sale;
        default: return b.realProfit - a.realProfit;
      }
    });
    return copy;
  }, [rows, sort]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Veículos mais rentáveis</p>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma venda com dados financeiros no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-2">Veículo</th>
                <th className="py-1 px-2">Aquisição</th>
                <th className="py-1 px-2">Venda</th>
                <th className="py-1 px-2">Despesas</th>
                <th className="py-1 px-2">Lucro bruto</th>
                <th className="py-1 px-2">Lucro real</th>
                <th className="py-1 pl-2">Margem</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    {r.title}
                    <span className="block text-[10px] text-muted-foreground">{formatDateBR(r.saleDate)}</span>
                  </td>
                  <td className="py-1.5 px-2">{formatMoney(r.acquisition ?? 0)}</td>
                  <td className="py-1.5 px-2">{formatMoney(r.sale)}</td>
                  <td className="py-1.5 px-2">{formatMoney(r.expenses)}</td>
                  <td className={cn("py-1.5 px-2", r.grossProfit < 0 && "text-destructive")}>{formatMoney(r.grossProfit)}</td>
                  <td className={cn("py-1.5 px-2 font-medium", r.realProfit < 0 && "text-destructive")}>
                    {r.realProfit < 0 ? "🔴 " : ""}{formatMoney(r.realProfit)}
                  </td>
                  <td className={cn("py-1.5 pl-2", r.margin < 0 && "text-destructive")}>{formatPercent(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
