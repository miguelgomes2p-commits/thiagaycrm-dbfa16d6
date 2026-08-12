import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Car, ChevronLeft, ChevronRight, FileText, Pencil, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVehicleLeads, useVehicleMedia } from "@/hooks/useVehicles";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFiscalDocuments } from "@/lib/fiscal.functions";
import { FISCAL_STATUS_LABEL } from "@/lib/fiscal/types";
import { IssueNfeDialog } from "@/components/fiscal/IssueNfeDialog";
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
  const [touchX, setTouchX] = useState<number | null>(null);
  const [nfeOpen, setNfeOpen] = useState(false);

  const similarQ = useQuery({
    enabled: !!vehicle?.id,
    queryKey: ["vehicle-similar", vehicle?.id],
    queryFn: () => findSimilarVehicles(vehicle!.id, 4),
  });

  const listDocsFn = useServerFn(listFiscalDocuments);
  const nfeQ = useQuery({
    enabled: !!vehicle?.id && vehicle?.status === "sold",
    queryKey: ["fiscal-documents", "vehicle", vehicle?.id],
    queryFn: () =>
      listDocsFn({ data: { workspaceId: vehicle!.workspace_id, vehicleId: vehicle!.id, limit: 5 } }) as Promise<
        Array<{ id: string; status: string; number: string | null }>
      >,
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
            <div
              className="relative aspect-[4/3] rounded-xl bg-muted overflow-hidden flex items-center justify-center group"
              onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
              onTouchEnd={(e) => {
                if (touchX === null) return;
                const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
                if (Math.abs(dx) > 50) setActive((i) => Math.min(photos.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1))));
                setTouchX(null);
              }}
            >
              {photos[active]?.url
                ? <img src={photos[active]!.url!} alt={vehicleTitle(vehicle)} className="h-full w-full object-cover" />
                : (
                  <div className="flex flex-col items-center gap-1">
                    <Car className="h-9 w-9 text-muted-foreground/60" />
                    <span className="text-[11px] text-muted-foreground">Sem fotos cadastradas</span>
                  </div>
                )}
              {photos.length > 1 && (
                <>
                  {active > 0 && (
                    <button type="button" aria-label="Anterior" onClick={() => setActive((i) => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-foreground/50 p-1.5 text-background cursor-pointer hover:bg-foreground/70">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  {active < photos.length - 1 && (
                    <button type="button" aria-label="Próxima" onClick={() => setActive((i) => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-foreground/50 p-1.5 text-background cursor-pointer hover:bg-foreground/70">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                  <span className="absolute bottom-2 right-2 rounded-full bg-foreground/60 px-2 py-0.5 text-[10px] text-background">
                    {active + 1}/{photos.length}
                  </span>
                </>
              )}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button key={p.id} type="button" onClick={() => setActive(i)}
                    className={cn("h-14 w-20 shrink-0 rounded-md overflow-hidden border-2 cursor-pointer transition-opacity",
                      i === active ? "border-primary" : "border-transparent opacity-60 hover:opacity-100")}>
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

            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nota fiscal</p>
              {vehicle.status === "sold" ? (
                nfeQ.data?.[0] ? (
                  <p className="text-xs">
                    NF-e {nfeQ.data[0].number ?? ""}{" "}
                    <Badge variant="secondary" className="text-[10px]">
                      {FISCAL_STATUS_LABEL[nfeQ.data[0].status as keyof typeof FISCAL_STATUS_LABEL] ?? nfeQ.data[0].status}
                    </Badge>
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-600">⚠ Pendente</span>
                    <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setNfeOpen(true)}>
                      <FileText className="h-4 w-4 mr-1.5" /> Emitir NF-e
                    </Button>
                  </div>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Disponível após marcar o veículo como vendido.</p>
              )}
            </div>

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
