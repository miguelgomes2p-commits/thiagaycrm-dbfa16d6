import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  VehicleGalleryManager, flushPendingPhotos, type PendingPhoto,
} from "@/components/vehicles/VehicleGalleryManager";
import {
  FUEL_OPTIONS, TRANSMISSION_OPTIONS, parseBRLNumber, type Vehicle, type VehicleStatus,
} from "@/lib/vehicles";
import { useFinancialAccess, useSaveVehicleFinancial, useVehicleFinancial } from "@/hooks/useFinancial";
import { parseMoney } from "@/lib/financial";


type FormState = {
  brand: string; model: string; version: string; year_manufacture: string; year_model: string;
  mileage: string; price: string; plate: string; renavam: string; chassis: string;
  fuel: string; transmission: string; color: string; engine: string; category: string;
  description: string; status: VehicleStatus; featured: boolean;
};

const EMPTY: FormState = {
  brand: "", model: "", version: "", year_manufacture: "", year_model: "", mileage: "", price: "",
  plate: "", renavam: "", chassis: "", fuel: "", transmission: "", color: "", engine: "", category: "",
  description: "", status: "available", featured: false,
};

function fromVehicle(v: Vehicle): FormState {
  return {
    brand: v.brand ?? "", model: v.model ?? "", version: v.version ?? "",
    year_manufacture: v.year_manufacture ? String(v.year_manufacture) : "",
    year_model: v.year_model ? String(v.year_model) : "",
    mileage: v.mileage != null ? String(v.mileage) : "",
    price: v.price != null ? String(v.price) : "",
    plate: v.plate ?? "", renavam: v.renavam ?? "", chassis: v.chassis ?? "",
    fuel: v.fuel ?? "", transmission: v.transmission ?? "", color: v.color ?? "",
    engine: v.engine ?? "", category: v.category ?? "", description: v.description ?? "",
    status: v.status, featured: v.featured,
  };
}

export function VehicleFormDialog({
  open, onOpenChange, workspaceId, vehicle,
}: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: string; vehicle?: Vehicle | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  // Seção financeira — visível apenas para usuários do beta privado (validado no servidor).
  const { allowed: financialBeta } = useFinancialAccess();
  const financialQ = useVehicleFinancial(vehicle?.id, financialBeta && open);
  const saveFinancial = useSaveVehicleFinancial(vehicle?.id);
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");

  useEffect(() => {
    const fin = financialQ.data?.financial;
    setAcquisitionCost(fin?.acquisition_cost != null ? String(fin.acquisition_cost) : "");
    setAcquiredAt(fin?.acquired_at ?? "");
  }, [financialQ.data]);

  useEffect(() => {
    if (!open) return;
    setForm(vehicle ? fromVehicle(vehicle) : EMPTY);
    setCreatedId(vehicle?.id ?? null);
    setPending([]);
    setUploadProgress(null);
  }, [open, vehicle]);


  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (!form.brand.trim() || !form.model.trim()) {
      toast.error("Marca e modelo são obrigatórios");
      return;
    }
    setSaving(true);
    const payload = {
      workspace_id: workspaceId,
      brand: form.brand.trim(),
      model: form.model.trim(),
      version: form.version.trim() || null,
      year_manufacture: form.year_manufacture ? Number(form.year_manufacture) : null,
      year_model: form.year_model ? Number(form.year_model) : null,
      mileage: form.mileage ? Number(form.mileage) : null,
      price: parseBRLNumber(form.price),
      plate: form.plate.trim().toUpperCase() || null,
      renavam: form.renavam.trim() || null,
      chassis: form.chassis.trim().toUpperCase() || null,
      fuel: form.fuel || null,
      transmission: form.transmission || null,
      color: form.color.trim() || null,
      engine: form.engine.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      status: form.status,
      featured: form.featured,
    };

    let savedId = createdId;
    if (createdId) {
      const { error } = await supabase.from("vehicles").update(payload as never).eq("id", createdId);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Veículo atualizado");
    } else {
      const { data, error } = await supabase.from("vehicles").insert(payload as never).select("id").single();
      if (error) { setSaving(false); toast.error(error.message); return; }
      const newId = (data as { id: string }).id;
      savedId = newId;
      setCreatedId(newId);
      if (pending.length > 0) {
        setUploadProgress({ done: 0, total: pending.length });
        const { failed } = await flushPendingPhotos({
          pending, vehicleId: newId, workspaceId,
          onProgress: (done, total) => setUploadProgress({ done, total }),
        });
        pending.forEach((p) => URL.revokeObjectURL(p.url));
        setPending([]);
        setUploadProgress(null);
        if (failed) toast.error(`${failed} foto(s) não puderam ser enviadas`);
        qc.invalidateQueries({ queryKey: ["vehicle-media", newId] });
        qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
      }
      setSaving(false);
      toast.success("Veículo cadastrado");
    }
    if (financialBeta && savedId && (acquisitionCost.trim() || acquiredAt)) {
      try {
        await saveFinancial.mutateAsync({
          vehicleId: savedId,
          acquisitionCost: parseMoney(acquisitionCost),
          acquiredAt: acquiredAt || null,
        });
      } catch {
        toast.error("Veículo salvo, mas não foi possível gravar as informações financeiras.");
      }
    }
    await qc.invalidateQueries({ queryKey: ["vehicles"] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
    onOpenChange(false);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Editar veículo" : "Novo veículo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Marca *</Label><Input value={form.brand} onChange={(e) => set({ brand: e.target.value })} /></div>
            <div><Label>Modelo *</Label><Input value={form.model} onChange={(e) => set({ model: e.target.value })} /></div>
            <div><Label>Versão</Label><Input value={form.version} onChange={(e) => set({ version: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><Label>Ano fab.</Label><Input inputMode="numeric" value={form.year_manufacture} onChange={(e) => set({ year_manufacture: e.target.value })} /></div>
            <div><Label>Ano mod.</Label><Input inputMode="numeric" value={form.year_model} onChange={(e) => set({ year_model: e.target.value })} /></div>
            <div><Label>KM</Label><Input inputMode="numeric" value={form.mileage} onChange={(e) => set({ mileage: e.target.value })} /></div>
            <div><Label>Preço (R$)</Label><Input value={form.price} onChange={(e) => set({ price: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Placa</Label><Input value={form.plate} onChange={(e) => set({ plate: e.target.value })} /></div>
            <div><Label>Renavam</Label><Input value={form.renavam} onChange={(e) => set({ renavam: e.target.value })} /></div>
            <div><Label>Chassi</Label><Input value={form.chassis} onChange={(e) => set({ chassis: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Combustível</Label>
              <Select value={form.fuel} onValueChange={(v) => set({ fuel: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{FUEL_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Câmbio</Label>
              <Select value={form.transmission} onValueChange={(v) => set({ transmission: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{TRANSMISSION_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Cor</Label><Input value={form.color} onChange={(e) => set({ color: e.target.value })} /></div>
            <div><Label>Motor</Label><Input value={form.engine} onChange={(e) => set({ engine: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div><Label>Categoria</Label><Input placeholder="SUV, Sedan..." value={form.category} onChange={(e) => set({ category: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set({ status: v as VehicleStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={form.featured} onCheckedChange={(v) => set({ featured: v })} />
              <Label className="cursor-pointer">Destaque</Label>
            </div>
          </div>
          {financialBeta && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Informações financeiras (opcional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor de aquisição (R$)</Label>
                  <Input placeholder="R$ 80.000,00" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} />
                </div>
                <div>
                  <Label>Data de aquisição</Label>
                  <Input type="date" value={acquiredAt} onChange={(e) => setAcquiredAt(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>

          <VehicleGalleryManager
            vehicleId={createdId}
            workspaceId={workspaceId}
            pending={pending}
            onPendingChange={setPending}
          />
          {uploadProgress && (
            <p className="text-xs text-muted-foreground">
              Enviando fotos: {uploadProgress.done} de {uploadProgress.total}...
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button className="cursor-pointer" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {createdId ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

