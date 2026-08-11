import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Car, Pencil, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehicleLeads, useVehicleMedia } from "@/hooks/useVehicles";
import { useQuery } from "@tanstack/react-query";
import {
  VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL, findSimilarVehicles, formatBRL, formatKm, formatYear,
  logLeadActivity, vehicleTitle, type Vehicle, type VehicleStatus,
} from "@/lib/vehicles";

export function VehicleDetailDialog({
  vehicle, onOpenChange, onEdit,
}: { vehicle: Vehicle | null; onOpenChange: (o: boolean) => void; onEdit: (v: Vehicle) => void }) {
  const qc = useQueryClient();
  const mediaQ = useVehicleMedia(vehicle?.id);
  const leadsQ = useVehicleLeads(vehicle?.id);
  const [active, setActive] = useState(0);
  const similarQ = useQuery({
    enabled: !!vehicle?.id,
    queryKey: ["vehicle-similar", vehicle?.id],
    queryFn: () => findSimilarVehicles(vehicle!.id, 4),
  });

  async function changeStatus(status: VehicleStatus, leadId?: string | null) {
    if (!vehicle) return;
    const patch: Record<string, unknown> = { status };
    if (status === "reserved") patch.reserved_for_lead_id = leadId ?? null;
    if (status === "sold") patch.sold_to_lead_id = leadId ?? null;
    if (status === "available") { patch.reserved_for_lead_id = null; patch.sold_to_lead_id = null; }
    const { error } = await supabase.from("vehicles").update(patch as never).eq("id", vehicle.id);
    if (error) { toast.error(error.message); return; }
    if (leadId) {
      await logLeadActivity({
        workspaceId: vehicle.workspace_id,
        leadId,
        type: status === "sold" ? "vehicle_sold" : "vehicle_reserved",
        title: `${status === "sold" ? "Veículo vendido" : "Veículo reservado"}: ${vehicleTitle(vehicle)}`,
        metadata: { vehicle_id: vehicle.id },
      });
    }
    toast.success(`Status alterado para ${VEHICLE_STATUS_LABEL[status]}`);
    qc.invalidateQueries({ queryKey: ["vehicles"] });
  }

  if (!vehicle) return null;
  const photos = mediaQ.data ?? [];

  return (
    <Dialog open={!!vehicle} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {vehicleTitle(vehicle)}
            <Badge className={cn("border-0", VEHICLE_STATUS_CLASS[vehicle.status])}>
              {VEHICLE_STATUS_LABEL[vehicle.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4 max-h-[72vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <div className="h-56 rounded-lg bg-muted overflow-hidden flex items-center justify-center">
              {photos[active]?.url
                ? <img src={photos[active]!.url!} alt={vehicleTitle(vehicle)} className="h-full w-full object-cover" />
                : <Car className="h-10 w-10 text-muted-foreground" />}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setActive(i)}
                    className={cn("h-14 w-20 shrink-0 rounded-md overflow-hidden border cursor-pointer",
                      i === active ? "border-primary" : "border-border")}>
                    {p.url && <img src={p.url} alt="" className="h-full w-full object-cover" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Spec label="Preço" value={formatBRL(vehicle.price)} />
              <Spec label="Ano" value={formatYear(vehicle)} />
              <Spec label="KM" value={formatKm(vehicle.mileage)} />
              <Spec label="Câmbio" value={vehicle.transmission ?? "—"} />
              <Spec label="Combustível" value={vehicle.fuel ?? "—"} />
              <Spec label="Cor" value={vehicle.color ?? "—"} />
              <Spec label="Placa" value={vehicle.plate ?? "—"} />
              <Spec label="Estoque" value={vehicle.stock_code ?? "—"} />
            </div>
            {vehicle.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{vehicle.description}</p>}

            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alterar status</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => changeStatus("available")}>Disponível</Button>
                <StatusWithLead label="Reservar" status="reserved" leads={leadsQ.data ?? []} onConfirm={changeStatus} />
                <StatusWithLead label="Vender" status="sold" leads={leadsQ.data ?? []} onConfirm={changeStatus} />
                <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => changeStatus("inactive")}>Inativar</Button>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Users className="h-3 w-3" /> Leads interessados ({leadsQ.data?.length ?? 0})
              </p>
              <ul className="space-y-1">
                {(leadsQ.data ?? []).map((r) => (
                  <li key={r.id} className="text-xs flex items-center justify-between">
                    <span>{r.leads?.contacts?.name ?? r.leads?.title ?? "Lead"}</span>
                    {r.is_primary && <Badge variant="secondary" className="text-[10px]">Principal</Badge>}
                  </li>
                ))}
                {(leadsQ.data ?? []).length === 0 && <li className="text-xs text-muted-foreground">Nenhum ainda.</li>}
              </ul>
            </div>

            {(similarQ.data?.length ?? 0) > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Similares disponíveis</p>
                <ul className="space-y-1">
                  {similarQ.data!.map((s) => (
                    <li key={s.id} className="text-xs flex items-center justify-between">
                      <span className="truncate">{vehicleTitle(s)}</span>
                      <span className="text-muted-foreground">{formatBRL(s.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onEdit(vehicle)}>
              <Pencil className="h-4 w-4 mr-1.5" /> Editar veículo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusWithLead({
  label, status, leads, onConfirm,
}: {
  label: string; status: VehicleStatus;
  leads: Array<{ lead_id: string; leads: { title: string; contacts: { name: string } | null } | null }>;
  onConfirm: (s: VehicleStatus, leadId?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState<string>("");
  if (leads.length === 0) {
    return <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => onConfirm(status, null)}>{label}</Button>;
  }
  return (
    <>
      <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{label} para qual lead?</DialogTitle></DialogHeader>
          <Select value={leadId} onValueChange={setLeadId}>
            <SelectTrigger><SelectValue placeholder="Selecione o lead" /></SelectTrigger>
            <SelectContent>
              {leads.map((l) => (
                <SelectItem key={l.lead_id} value={l.lead_id}>
                  {l.leads?.contacts?.name ?? l.leads?.title ?? "Lead"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="cursor-pointer" onClick={() => { onConfirm(status, leadId || null); setOpen(false); }}>
            Confirmar
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
