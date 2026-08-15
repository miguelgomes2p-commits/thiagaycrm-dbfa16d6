import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FinancialKpiCard({
  label, value, hint, negative,
}: { label: string; value: string; hint?: string; negative?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold", negative && "text-destructive")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}
