import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Crosshair, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceLocations } from "@/hooks/useLeadFields";
import type { LocationPayload } from "./LocationMessageCard";
import { LocationMessageCard } from "./LocationMessageCard";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId?: string | null;
  sending?: boolean;
  onSend: (loc: LocationPayload) => void;
};

export function LocationPickerDialog({ open, onOpenChange, workspaceId, sending, onSend }: Props) {
  const savedQ = useWorkspaceLocations(workspaceId);
  const [preview, setPreview] = useState<LocationPayload | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useCurrentLocation() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Seu navegador não oferece suporte a localização.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPreview({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          name: "Minha localização",
          address: null,
        });
      },
      () => {
        setLocating(false);
        setError("Não foi possível acessar sua localização. Verifique a permissão do navegador.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  function close(v: boolean) {
    if (!v) { setPreview(null); setError(null); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Enviar localização</DialogTitle></DialogHeader>

        {preview ? (
          <div className="space-y-3">
            <LocationMessageCard loc={preview} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreview(null)} disabled={sending}>Voltar</Button>
              <Button
                className="flex-1 gradient-brand text-primary-foreground border-0"
                disabled={sending}
                onClick={() => onSend(preview)}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar localização"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={useCurrentLocation} disabled={locating}>
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4 text-primary" />}
              Usar minha localização atual
            </Button>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Localizações salvas</p>
              {savedQ.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
              {!savedQ.isLoading && (savedQ.data?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma localização cadastrada. O administrador pode cadastrar em Configurações → Locais do workspace.
                </p>
              )}
              <div className="space-y-1.5">
                {savedQ.data?.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setPreview({ latitude: Number(l.latitude), longitude: Number(l.longitude), name: l.name, address: l.address })}
                    className={cn(
                      "w-full text-left rounded-lg border border-border px-3 py-2 hover:border-primary/50 hover:bg-surface/60 transition-colors",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Building2 className="h-3.5 w-3.5 text-primary" /> {l.name}
                      {l.is_default && <span className="text-[10px] text-primary/80">padrão</span>}
                    </div>
                    {l.address && <div className="text-[11px] text-muted-foreground truncate">{l.address}</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
