import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Wallet } from "lucide-react";
import { FinancialKpiCard } from "@/components/financial/FinancialKpiCard";
import { InventoryCapitalSummary } from "@/components/financial/InventoryCapitalSummary";
import { ProfitabilityTable } from "@/components/financial/ProfitabilityTable";
import { useFinancialAccess, useFinancialOverview } from "@/hooks/useFinancial";
import { formatMoney, formatPercent, periodRange, type PeriodPreset } from "@/lib/financial";

export const Route = createFileRoute("/_authenticated/app/financial")({
  component: FinancialPage,
  head: () => ({
    meta: [
      { title: "Financeiro (Beta) | Lupus CRM" },
      { name: "description", content: "Rentabilidade do estoque: aquisição, despesas, lucro real e capital investido." },
      { property: "og:title", content: "Financeiro (Beta) | Lupus CRM" },
      { property: "og:description", content: "Gestão de rentabilidade dos veículos do estoque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês anterior" },
  { value: "last_30", label: "Últimos 30 dias" },
  { value: "this_year", label: "Este ano" },
  { value: "custom", label: "Período personalizado" },
];

function FinancialPage() {
  const { allowed, isLoading: accessLoading } = useFinancialAccess();
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = useMemo(() => periodRange(preset, custom), [preset, custom]);
  const q = useFinancialOverview(ws?.id, range.from, range.to, allowed);

  if (accessLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="p-10 text-center space-y-2 max-w-md mx-auto">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">403 — acesso não autorizado</p>
          <p className="text-xs text-muted-foreground">Este recurso está em beta privado.</p>
        </Card>
      </div>
    );
  }

  const sold = q.data?.sold;
  const stock = q.data?.stock;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Financeiro
            <Badge variant="secondary" className="text-[10px]">BETA</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Rentabilidade dos veículos e capital investido no estoque.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <Input type="date" className="w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <Input type="date" className="w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </>
          )}
        </div>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando indicadores...</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar os indicadores.</p>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <FinancialKpiCard label="Receita em vendas" value={formatMoney(sold?.revenue ?? 0)} hint={`${sold?.count ?? 0} venda(s)`} />
            <FinancialKpiCard label="Custo de aquisição" value={formatMoney(sold?.acquisition ?? 0)} />
            <FinancialKpiCard label="Lucro bruto" value={formatMoney(sold?.grossProfit ?? 0)} negative={(sold?.grossProfit ?? 0) < 0} />
            <FinancialKpiCard label="Despesas dos veículos" value={formatMoney(sold?.expenses ?? 0)} />
            <FinancialKpiCard label="Lucro real" value={formatMoney(sold?.realProfit ?? 0)} negative={(sold?.realProfit ?? 0) < 0} />
            <FinancialKpiCard label="Margem real média" value={formatPercent(sold?.avgMargin ?? 0)} negative={(sold?.avgMargin ?? 0) < 0} />
          </div>

          {stock && <InventoryCapitalSummary stock={stock} age={q.data?.age ?? []} />}
          <ProfitabilityTable rows={q.data?.rows ?? []} />
        </>
      )}
    </div>
  );
}
