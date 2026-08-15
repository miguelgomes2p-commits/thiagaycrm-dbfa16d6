import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/financial";
import type { FinancialOverview } from "@/lib/financial";

const BUCKET_LABEL: Record<string, string> = {
  "0-30": "0–30 dias",
  "31-60": "31–60 dias",
  "61-90": "61–90 dias",
  "90+": "+90 dias",
};
const ORDER = ["0-30", "31-60", "61-90", "90+"];

export function InventoryCapitalSummary({ stock, age }: { stock: FinancialOverview["stock"]; age: FinancialOverview["age"] }) {
  const buckets = ORDER.map((b) => age.find((a) => a.bucket === b) ?? { bucket: b, count: 0, invested: 0 });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="p-4 space-y-1.5">
        <p className="text-sm font-semibold">Capital em estoque</p>
        <Line label="Veículos disponíveis" value={String(stock.count)} />
        <Line label="Valor de aquisição" value={formatMoney(stock.acquisition)} />
        <Line label="Custos acumulados" value={formatMoney(stock.expenses)} />
        <Line label="Capital investido" value={formatMoney(stock.invested)} strong />
        <Line label="Valor anunciado" value={formatMoney(stock.asking)} />
        <Line label="Margem potencial" value={formatMoney(stock.potentialProfit)} strong />
      </Card>
      <Card className="p-4 space-y-1.5">
        <p className="text-sm font-semibold">Idade do estoque</p>
        {buckets.map((b) => (
          <Line key={b.bucket} label={`${BUCKET_LABEL[b.bucket]} · ${b.count} veículo(s)`} value={formatMoney(b.invested)} />
        ))}
      </Card>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}
