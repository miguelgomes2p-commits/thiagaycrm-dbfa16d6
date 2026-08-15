import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ban } from "lucide-react";
import { formatDateBR, formatMoney, type VehicleExpense } from "@/lib/financial";
import { useCancelVehicleExpense } from "@/hooks/useFinancial";
import { toast } from "sonner";

export function VehicleExpenseList({
  vehicleId, expenses,
}: { vehicleId: string; expenses: VehicleExpense[] }) {
  const cancel = useCancelVehicleExpense(vehicleId);

  if (expenses.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma despesa registrada.</p>;
  }

  return (
    <ul className="space-y-1">
      {expenses.map((e) => {
        const cancelled = e.status !== "active";
        return (
          <li key={e.id} className="flex items-center gap-2 text-xs">
            <span className={cancelled ? "line-through text-muted-foreground" : ""}>{e.category}</span>
            {e.description && <span className="text-muted-foreground truncate">· {e.description}</span>}
            <span className="ml-auto text-muted-foreground">{formatDateBR(e.expense_date)}</span>
            <span className={cancelled ? "line-through text-muted-foreground" : "text-destructive font-medium"}>
              -{formatMoney(e.amount)}
            </span>
            {cancelled ? (
              <Badge variant="secondary" className="text-[10px]">Cancelada</Badge>
            ) : (
              <Button
                size="icon" variant="ghost" className="h-6 w-6 cursor-pointer"
                aria-label="Cancelar despesa"
                onClick={async () => {
                  try { await cancel.mutateAsync(e.id); toast.success("Despesa cancelada"); }
                  catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
                }}
              >
                <Ban className="h-3 w-3" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
