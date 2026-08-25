import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Crosshair, Building2, Loader2, Settings2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceLocations } from "@/hooks/useLeadFields";
import type { LocationPayload } from "./LocationMessageCard";
import { LocationMessageCard } from "./LocationMessageCard";
import { Link } from "@tanstack/react-router";

export type SendLocationArgs =
  | { locationId: string; preview: LocationPayload }
  | { locationId?: undefined; preview: LocationPayload };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId?: string | null;
  sending?: boolean;
  canManage?: boolean;
  onSend: (args: SendLocationArgs) => void;
};

/**
 * Envio de localização a partir dos locais cadastrados no workspace (loja,
 * unidades, pátio). A geolocalização do dispositivo é apenas uma opção
 * secundária e nunca substitui a localização da loja.
 */
export function LocationPickerDialog({ open, onOpenChange, workspaceId, sending, canManage, onSend }: Props) {
  const savedQ = useWorkspaceLocations(workspaceId);
  const saved = savedQ.data ?? [];
  const defaultLoc = useMemo(() => saved.find((l) => l.is_default) ?? saved[0] ?? null, [saved]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [devicePreview, setDevicePreview] = useState<LocationPayload | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && defaultLoc && !selectedId && !devicePreview) setSelectedId(defaultLoc.id);
  }, [open, defaultLoc, selectedId, devicePreview]);

  const selected = saved.find((l) => l.id === selectedId) ?? null;
  const previewPayload: LocationPayload | null = devicePreview
    ? devicePreview
    : selected
      ? {
          latitude: Number(selected.latitude),
          longitude: Number(selected.longitude),
          name: selected.name,
          address: selected.address,
        }
      : null;

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
        setSelectedId(null);
        setDevicePreview({
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
    if (!v) { setDevicePreview(null); setSelectedId(null); setError(null); }
    onOpenChange(v);
  }

  function send() {
    if (devicePreview) { onSend({ preview: devicePreview }); return; }
    if (selected && previewPayload) { onSend({ locationId: selected.id, preview: previewPayload }); }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Enviar localização
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {savedQ.isLoading && <p className="text-xs text-muted-foreground">Carregando locais…</p>}

          {!savedQ.isLoading && saved.length === 0 && !devicePreview && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm font-medium">Localização da loja ainda não configurada.</p>
              <p className="text-xs text-muted-foreground">
                Peça a um administrador para cadastrar o endereço da empresa.
              </p>
              {canManage && (
                <Button asChild size="sm" variant="outline" className="cursor-pointer">
                  <Link to="/app/settings" onClick={() => close(false)}>
                    <Settings2 className="h-3.5 w-3.5 mr-1" /> Configurar agora
                  </Link>
                </Button>
              )}
            </div>
          )}

          {saved.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {saved.length === 1 ? "Localização da loja" : "Escolha a unidade"}
              </p>
              {saved.map((l) => {
                const active = !devicePreview && selectedId === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => { setDevicePreview(null); setSelectedId(l.id); }}
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer",
                      active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-surface/60",
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Building2 className="h-3.5 w-3.5 text-primary" /> {l.name}
                      {l.is_default && <span className="text-[10px] text-primary/80">padrão</span>}
                      {active && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                    </div>
                    {l.address && <div className="text-[11px] text-muted-foreground truncate">{l.address}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {previewPayload && <LocationMessageCard loc={previewPayload} />}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 cursor-pointer"
              onClick={() => close(false)}
              disabled={sending}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 gradient-brand text-primary-foreground border-0 cursor-pointer"
              disabled={sending || !previewPayload}
              onClick={send}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
            </Button>
          </div>

          <div className="border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground cursor-pointer"
              onClick={useCurrentLocation}
              disabled={locating || sending}
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              Minha localização atual (do dispositivo)
            </Button>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
