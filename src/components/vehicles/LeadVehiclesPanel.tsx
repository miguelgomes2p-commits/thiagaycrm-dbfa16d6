import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Car, Plus, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadVehicles } from "@/hooks/useVehicles";
import {
  VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL, formatBRL, formatYear, logLeadActivity, vehicleTitle, type Vehicle,
} from "@/lib/vehicles";

/**
 * Painel de veículos de interesse de um lead.
 * Usado no card do pipeline e na sidebar da conversa (compact).
 */
export function LeadVehiclesPanel({
  leadId, workspaceId, compact,
}: { leadId: string; workspaceId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const listQ = useLeadVehicles(leadId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [term, setTerm] = useState("");

  const searchQ = useQuery({
    enabled: pickerOpen,
    queryKey: ["vehicle-search", workspaceId, term],
    queryFn: async () => {
      let q = supabase
        .from("vehicles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .neq("status", "inactive")
        .limit(8);
      const s = term.trim().replace(/[%,]/g, "");
      if (s) q = q.or(`brand.ilike.%${s}%,model.ilike.%${s}%,version.ilike.%${s}%,plate.ilike.%${s}%,stock_code.ilike.%${s}%`);
      const { data } = await q.order("created_at", { ascending: false });
      return (data ?? []) as unknown as Vehicle[];
    },
  });

  async function relate(v: Vehicle) {
    const isFirst = (listQ.data?.length ?? 0) === 0;
    const { error } = await supabase.from("lead_vehicle_interests").insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      vehicle_id: v.id,
      is_primary: isFirst,
    } as never);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Veículo já vinculado" : error.message);
      return;
    }
    await logLeadActivity({
      workspaceId, leadId, type: "vehicle_linked",
      title: `Veículo de interesse: ${vehicleTitle(v)}`,
      metadata: { vehicle_id: v.id },
    });
    setPickerOpen(false);
    setTerm("");
    qc.invalidateQueries({ queryKey: ["lead-vehicles", leadId] });
    qc.invalidateQueries({ queryKey: ["vehicle-leads", v.id] });
  }

  async function unlink(id: string, vehicleId: string) {
    await supabase.from("lead_vehicle_interests").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["lead-vehicles", leadId] });
    qc.invalidateQueries({ queryKey: ["vehicle-leads", vehicleId] });
  }

  async function makePrimary(id: string) {
    await supabase.from("lead_vehicle_interests").update({ is_primary: false } as never).eq("lead_id", leadId);
    await supabase.from("lead_vehicle_interests").update({ is_primary: true } as never).eq("id", id);
    qc.invalidateQueries({ queryKey: ["lead-vehicles", leadId] });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <Car className="h-3 w-3" /> Veículos de interesse
        </h4>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 cursor-pointer">
              <Plus className="h-3.5 w-3.5 mr-1" /> Vincular
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="end">
            <Input autoFocus placeholder="Buscar por marca, modelo, placa..." value={term}
              onChange={(e) => setTerm(e.target.value)} className="mb-2" />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {(searchQ.data ?? []).map((v) => (
                <button key={v.id} type="button" onClick={() => relate(v)}
                  className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer">
                  <p className="text-xs font-medium truncate">{vehicleTitle(v)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatYear(v)} · {formatBRL(v.price)} · {VEHICLE_STATUS_LABEL[v.status]}
                  </p>
                </button>
              ))}
              {(searchQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-3">Nenhum veículo encontrado no estoque.</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-1.5">
        {(listQ.data ?? []).map((it) => {
          const v = it.vehicles;
          if (!v) return null;
          return (
            <div key={it.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium truncate", compact ? "text-xs" : "text-sm")}>{vehicleTitle(v)}</p>
                <p className="text-[10px] text-muted-foreground">{formatYear(v)} · {formatBRL(v.price)}</p>
              </div>
              <Badge className={cn("border-0 text-[10px]", VEHICLE_STATUS_CLASS[v.status])}>
                {VEHICLE_STATUS_LABEL[v.status]}
              </Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6 cursor-pointer" title="Definir como principal"
                onClick={() => makePrimary(it.id)}>
                <Star className={cn("h-3.5 w-3.5", it.is_primary && "fill-current text-primary")} />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 cursor-pointer" title="Desvincular"
                onClick={() => unlink(it.id, v.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        {(listQ.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum veículo vinculado a este lead.</p>
        )}
      </div>
    </div>
  );
}
