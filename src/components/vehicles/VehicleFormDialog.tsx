import { useEffect, useRef, useState } from "react";
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
import { Loader2, Star, Trash2, Upload } from "lucide-react";
import { useVehicleMedia } from "@/hooks/useVehicles";
import {
  FUEL_OPTIONS, TRANSMISSION_OPTIONS, VEHICLE_MEDIA_BUCKET, parseBRLNumber, type Vehicle, type VehicleStatus,
} from "@/lib/vehicles";

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

  useEffect(() => {
    if (!open) return;
    setForm(vehicle ? fromVehicle(vehicle) : EMPTY);
    setCreatedId(vehicle?.id ?? null);
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

    if (createdId) {
      const { error } = await supabase.from("vehicles").update(payload as never).eq("id", createdId);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Veículo atualizado");
    } else {
      const { data, error } = await supabase.from("vehicles").insert(payload as never).select("id").single();
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      setCreatedId((data as { id: string }).id);
      toast.success("Veículo cadastrado", { description: "Agora você pode adicionar as fotos." });
    }
    qc.invalidateQueries({ queryKey: ["vehicles"] });
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
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>

          {createdId ? (
            <VehicleMediaManager vehicleId={createdId} workspaceId={workspaceId} />
          ) : (
            <p className="text-xs text-muted-foreground">Salve o veículo para habilitar o envio de fotos.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {createdId ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VehicleMediaManager({ vehicleId, workspaceId }: { vehicleId: string; workspaceId: string }) {
  const qc = useQueryClient();
  const mediaQ = useVehicleMedia(vehicleId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const existing = mediaQ.data?.length ?? 0;
    let i = 0;
    for (const file of Array.from(files).slice(0, 20)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${workspaceId}/${vehicleId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(VEHICLE_MEDIA_BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (error) { toast.error(`Falha ao enviar ${file.name}`); continue; }
      await supabase.from("vehicle_media").insert({
        vehicle_id: vehicleId,
        workspace_id: workspaceId,
        storage_path: path,
        media_type: file.type.startsWith("video") ? "video" : "photo",
        sort_order: existing + i,
        is_cover: existing === 0 && i === 0,
      } as never);
      i++;
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }

  async function remove(id: string, path: string) {
    await supabase.from("vehicle_media").delete().eq("id", id);
    await supabase.storage.from(VEHICLE_MEDIA_BUCKET).remove([path]);
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }

  async function setCover(id: string) {
    await supabase.from("vehicle_media").update({ is_cover: false } as never).eq("vehicle_id", vehicleId);
    await supabase.from("vehicle_media").update({ is_cover: true } as never).eq("id", id);
    qc.invalidateQueries({ queryKey: ["vehicle-media", vehicleId] });
    qc.invalidateQueries({ queryKey: ["vehicle-covers"] });
  }

  return (
    <div className="pt-3 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <Label>Fotos</Label>
        <Button type="button" size="sm" variant="outline" className="cursor-pointer"
          onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
          Enviar
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(mediaQ.data ?? []).map((m) => (
          <div key={m.id} className="relative group rounded-md overflow-hidden border border-border">
            {m.url && <img src={m.url} alt="Foto do veículo" className="h-20 w-full object-cover" />}
            <div className="absolute inset-0 bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
              <Button size="icon" variant="secondary" className="h-7 w-7 cursor-pointer" onClick={() => setCover(m.id)}>
                <Star className={m.is_cover ? "h-3.5 w-3.5 fill-current" : "h-3.5 w-3.5"} />
              </Button>
              <Button size="icon" variant="destructive" className="h-7 w-7 cursor-pointer" onClick={() => remove(m.id, m.storage_path)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
        {(mediaQ.data ?? []).length === 0 && (
          <p className="col-span-4 text-xs text-muted-foreground">Nenhuma foto enviada.</p>
        )}
      </div>
    </div>
  );
}
