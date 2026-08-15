import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES, parseMoney } from "@/lib/financial";
import { useAddVehicleExpense } from "@/hooks/useFinancial";

export function AddVehicleExpenseDialog({
  open, onOpenChange, vehicleId,
}: { open: boolean; onOpenChange: (o: boolean) => void; vehicleId: string }) {
  const [category, setCategory] = useState<string>("Mecânica");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const add = useAddVehicleExpense(vehicleId);

  async function submit() {
    const value = parseMoney(amount);
    if (!value || value <= 0) { toast.error("Informe um valor válido."); return; }
    try {
      await add.mutateAsync({ vehicleId, category, amount: value, expenseDate: date, description: description || null });
      toast.success("Despesa registrada");
      setAmount(""); setDescription("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a despesa.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adicionar despesa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor</Label><Input placeholder="R$ 1.500,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div><Label>Descrição</Label><Input placeholder="Revisão completa" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="cursor-pointer" disabled={add.isPending} onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
