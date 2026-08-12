import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Car, Loader2, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeadVehicles, useVehicleMedia } from "@/hooks/useVehicles";
import {
  VEHICLE_STATUS_CLASS, VEHICLE_STATUS_LABEL, formatBRL, formatYear, logLeadActivity,
  vehicleSpecText, vehicleTitle, type Vehicle,
} from "@/lib/vehicles";

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",").pop() ?? "");
    reader.onerror = () => reject(new Error("Falha ao ler foto"));
    reader.readAsDataURL(blob);
  });
  return { base64, mimeType: blob.type || "image/jpeg" };
}

/**
 * Envia a ficha completa de um veículo (texto + fotos) na conversa ativa.
 * O envio real é delegado ao composer (mesmas server functions do chat).
 */
export function SendVehicleDialog({
  open, onOpenChange, workspaceId, leadId, sendText, sendPhoto,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  leadId: string | null;
  sendText: (body: string) => Promise<void>;
  sendPhoto: (photo: { fileName: string; mimeType: string; base64: string; caption?: string | null }) => Promise<void>;
}) {
  const linkedQ = useLeadVehicles(leadId ?? undefined);
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<Vehicle | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const mediaQ = useVehicleMedia(picked?.id);

  useEffect(() => {
    if (!open) { setPicked(null); setTerm(""); setProgress({ done: 0, total: 0 }); }
  }, [open]);

  const searchQ = useQuery({
    enabled: open && term.trim().length > 0,
    queryKey: ["vehicle-search-send", workspaceId, term],
    queryFn: async () => {
      const s = term.trim().replace(/[%,]/g, "");
      const { data } = await supabase
        .from("vehicles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .or(`brand.ilike.%${s}%,model.ilike.%${s}%,version.ilike.%${s}%,plate.ilike.%${s}%,stock_code.ilike.%${s}%`)
        .limit(8);
      return (data ?? []) as unknown as Vehicle[];
    },
  });

  // Estoque recente — mostrado assim que o diálogo abre (sem precisar pesquisar).
  const recentQ = useQuery({
    enabled: open && term.trim().length === 0,
    queryKey: ["vehicle-recent-send", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as unknown as Vehicle[];
    },
  });

  const linked = (linkedQ.data ?? []).map((i) => i.vehicles).filter(Boolean) as Vehicle[];
  const options = term.trim()
    ? (searchQ.data ?? [])
    : [...linked, ...(recentQ.data ?? []).filter((v) => !linked.some((l) => l.id === v.id))];
  const photos = (mediaQ.data ?? []).filter((m) => m.url);

  async function confirm() {
    if (!picked) return;
    setSending(true);
    setProgress({ done: 0, total: photos.length });
    const spec = vehicleSpecText(picked);
    try {
      let failed = 0;
      let captionSent = false;
      for (const [i, p] of photos.entries()) {
        try {
          const { base64, mimeType } = await urlToBase64(p.url!);
          await sendPhoto({
            fileName: `${vehicleTitle(picked)} ${i + 1}.jpg`.replace(/\s+/g, "-"),
            mimeType,
            base64,
            caption: captionSent ? null : spec,
          });
          captionSent = true;
        } catch {
          failed++;
          toast.error(`Foto ${i + 1} não pôde ser enviada`);
        }
        setProgress({ done: i + 1, total: photos.length });
      }
      // Sem fotos (ou todas falharam): garante o envio da ficha em texto.
      if (!captionSent) await sendText(spec);
      if (leadId) {
        await logLeadActivity({
          workspaceId, leadId, type: "vehicle_sent",
          title: `Ficha enviada: ${vehicleTitle(picked)}`,
          metadata: { vehicle_id: picked.id, photos: photos.length - failed },
        });
      }
      toast.success("Ficha do veículo enviada");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a ficha");
    } finally {
      setSending(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Enviar veículo</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar no estoque (marca, modelo, placa)..." value={term}
                onChange={(e) => setTerm(e.target.value)} />
            </div>
            {!term.trim() && (
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Vinculados ao lead e estoque recente
              </p>
            )}
            <div className="max-h-72 overflow-y-auto space-y-1">
              {options.map((v) => (
                <button key={v.id} type="button" onClick={() => setPicked(v)}
                  className="w-full flex items-center gap-2 rounded-md border border-border p-2 text-left hover:bg-muted/60 cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{vehicleTitle(v)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatYear(v)} · {formatBRL(v.price)}</p>
                  </div>
                  <Badge className={cn("border-0 text-[10px]", VEHICLE_STATUS_CLASS[v.status])}>
                    {VEHICLE_STATUS_LABEL[v.status]}
                  </Badge>
                </button>
              ))}
              {options.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  {term.trim() ? "Nenhum veículo encontrado." : "Nenhum veículo vinculado — busque no estoque acima."}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs whitespace-pre-wrap">{vehicleSpecText(picked)}</p>
            </div>
            {mediaQ.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando fotos...</p>
            ) : photos.length > 0 ? (
              <>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{photos.length} foto(s) serão enviadas</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {photos.map((p) => (
                    <img key={p.id} src={p.url!} alt="" className="h-16 w-20 shrink-0 rounded-md object-cover border border-border" />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Este veículo não tem fotos cadastradas.</p>
            )}
            {sending && progress.total > 0 && (
              <div className="space-y-1">
                <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">Enviando foto {progress.done} de {progress.total}...</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {picked && (
            <Button variant="outline" className="cursor-pointer" disabled={sending} onClick={() => setPicked(null)}>
              Trocar veículo
            </Button>
          )}
          <Button className="cursor-pointer" disabled={!picked || sending} onClick={confirm}>
            {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Enviar ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
