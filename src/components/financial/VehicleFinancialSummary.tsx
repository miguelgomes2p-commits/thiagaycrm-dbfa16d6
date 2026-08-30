import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { History, Plus, Save, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calculateVehicleFinancials, formatDateBR, formatMoney, formatPercent, parseMoney,
} from "@/lib/financial";
import { useAddVehicleExpense, useSaveVehicleFinancial, useVehicleFinancial } from "@/hooks/useFinancial";
import { AddVehicleExpenseDialog } from "@/components/financial/AddVehicleExpenseDialog";
import { VehicleExpenseList } from "@/components/financial/VehicleExpenseList";
import type { Vehicle } from "@/lib/vehicles";

/** Painel FINANCEIRO do veículo — renderizado somente para usuários beta autorizados. */
export function VehicleFinancialSummary({ vehicle, enabled }: { vehicle: Vehicle; enabled: boolean }) {
  const q = useVehicleFinancial(vehicle.id, enabled);
  const save = useSaveVehicleFinancial(vehicle.id);
  const addExpense = useAddVehicleExpense(vehicle.id);
  const [acq, setAcq] = useState("");
  const [acqDate, setAcqDate] = useState("");
  const [cost, setCost] = useState("");
  const [sale, setSale] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);


  const fin = q.data?.financial ?? null;
  useEffect(() => {
    setAcq(fin?.acquisition_cost != null ? String(fin.acquisition_cost) : "");
    setAcqDate(fin?.acquired_at ?? "");
    setSale(fin?.sale_amount != null ? String(fin.sale_amount) : "");
    setSaleDate(fin?.sale_date ?? "");
  }, [fin]);

  if (!enabled) return null;

  const expenses = q.data?.expenses ?? [];
  const calc = calculateVehicleFinancials({
    acquisitionCost: fin?.acquisition_cost,
    askingPrice: vehicle.price,
    saleAmount: fin?.sale_amount,
    expenses,
  });
  const isSold = vehicle.status === "sold";

  async function persist() {
    try {
      await save.mutateAsync({
        vehicleId: vehicle.id,
        acquisitionCost: parseMoney(acq),
        acquiredAt: acqDate || null,
        saleAmount: parseMoney(sale),
        saleDate: saleDate || null,
      });
      const extraCost = parseMoney(cost);
      if (extraCost && extraCost > 0) {
        await addExpense.mutateAsync({
          vehicleId: vehicle.id,
          category: "Outros",
          amount: extraCost,
          expenseDate: new Date().toISOString().slice(0, 10),
          description: "Custos com o veículo",
        });
        setCost("");
      }
      toast.success("Financeiro atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar financeiro");
    }
  }

  return (
    <div className="pt-2 border-t border-border space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Wallet className="h-3 w-3" /> Financeiro
        <Badge variant="secondary" className="text-[10px]">BETA</Badge>
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Valor de aquisição</Label>
          <Input className="h-8 text-xs" placeholder="R$ 80.000,00" value={acq} onChange={(e) => setAcq(e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Data de aquisição</Label>
          <Input className="h-8 text-xs" type="date" value={acqDate} onChange={(e) => setAcqDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Custos com o veículo</Label>
          <Input className="h-8 text-xs" placeholder="R$ 2.500,00" value={cost} onChange={(e) => setCost(e.target.value)} />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Soma atual: {formatMoney(calc.expensesTotal)} — o valor informado é somado como despesa ao salvar.
          </p>
        </div>
        <div>
          <Label className="text-[11px]">Valor de venda</Label>
          <Input className="h-8 text-xs" placeholder="R$ 96.000,00" value={sale} onChange={(e) => setSale(e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Data da venda</Label>
          <Input className="h-8 text-xs" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </div>
      </div>
      <Button size="sm" variant="outline" className="cursor-pointer" disabled={save.isPending || addExpense.isPending} onClick={persist}>
        <Save className="h-4 w-4 mr-1.5" /> Salvar financeiro
      </Button>


      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1">
        <Row label="Preço anunciado" value={formatMoney(vehicle.price ?? 0)} />
        <Row label="Despesas" value={formatMoney(calc.expensesTotal)} />
        <Row label="Custo total" value={formatMoney(calc.totalCost)} />
        {isSold && calc.saleAmount != null ? (
          <>
            <Row label="Valor da venda" value={formatMoney(calc.saleAmount)} />
            <Row label="Lucro bruto" value={formatMoney(calc.grossProfit)} negative={(calc.grossProfit ?? 0) < 0} />
            <Row label="Lucro real" value={formatMoney(calc.realProfit)} negative={(calc.realProfit ?? 0) < 0} />
            <Row label="Margem real" value={formatPercent(calc.realMargin)} negative={(calc.realMargin ?? 0) < 0} />
          </>
        ) : (
          <>
            <Row label="Lucro potencial" value={formatMoney(calc.potentialProfit)} negative={calc.potentialProfit < 0} />
            <Row label="Margem potencial" value={formatPercent(calc.potentialMargin)} negative={calc.potentialMargin < 0} />
          </>
        )}
      </dl>
      {!isSold && (
        <p className="text-[10px] text-muted-foreground">Valores potenciais — o veículo ainda não foi vendido.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setExpenseOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Adicionar despesa
        </Button>
        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setShowHistory((v) => !v)}>
          <History className="h-4 w-4 mr-1.5" /> {showHistory ? "Ocultar" : "Ver"} movimentações
        </Button>
      </div>

      {showHistory && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico financeiro</p>
          <ul className="space-y-1 text-xs">
            {fin?.acquisition_cost != null && (
              <li className="flex justify-between">
                <span>Aquisição</span>
                <span className="text-muted-foreground">{formatDateBR(fin.acquired_at)}</span>
                <span className="text-destructive font-medium">-{formatMoney(fin.acquisition_cost)}</span>
              </li>
            )}
          </ul>
          <VehicleExpenseList vehicleId={vehicle.id} expenses={expenses} />
          {fin?.sale_amount != null && (
            <p className="flex justify-between text-xs">
              <span>Venda</span>
              <span className="text-muted-foreground">{formatDateBR(fin.sale_date)}</span>
              <span className="text-success font-medium">+{formatMoney(fin.sale_amount)}</span>
            </p>
          )}
          <p className="flex justify-between text-xs font-semibold border-t border-border pt-1">
            <span>Resultado {isSold ? "real" : "potencial"}</span>
            <span className={cn((isSold ? (calc.realProfit ?? 0) : calc.potentialProfit) < 0 && "text-destructive")}>
              {formatMoney(isSold ? calc.realProfit : calc.potentialProfit)}
            </span>
          </p>
        </div>
      )}

      <AddVehicleExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} vehicleId={vehicle.id} />
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", negative && "text-destructive")}>{value}</dd>
    </div>
  );
}
