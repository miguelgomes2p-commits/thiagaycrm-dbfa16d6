import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PhoneCall, Copy, Info } from "lucide-react";
import { toast } from "sonner";
import {
  getCallProvider,
  isTelSupported,
  normalizePhone,
  resolveCallCapabilities,
  type CallCapability,
  type CallTarget,
} from "@/lib/communication/call-providers";

/**
 * Botão de ligação do header da conversa.
 * Mostra SOMENTE ações realmente disponíveis; capacidades indisponíveis
 * aparecem como informação (nunca como botão que falha depois).
 */
export function CallButton({ target, isAdmin }: { target: CallTarget; isAdmin: boolean }) {
  const [caps, setCaps] = useState<CallCapability[]>([]);
  const phone = normalizePhone(target.phone);

  useEffect(() => {
    let alive = true;
    void resolveCallCapabilities(target).then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
  }, [target.conversationId, target.phone, target.waProvider, target.isGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = caps.filter((c) => c.supported);
  const unavailable = caps.filter((c) => !c.supported);

  if (available.length === 0 && !isAdmin) return null;

  async function call(type: CallCapability["type"]) {
    const provider = getCallProvider(type);
    if (!provider) return;
    try {
      if (type === "phone" && !isTelSupported()) {
        // Desktop sem handler de tel: mostra o número e permite copiar.
        await navigator.clipboard.writeText(phone ?? "");
        toast.success(`Número copiado: ${phone}`);
        return;
      }
      await provider.initiateCall(target);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a chamada.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" title="Ligar para cliente">
          <PhoneCall className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">
          Ligar para cliente
          {phone && <div className="font-normal text-muted-foreground mt-0.5">{phone}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((c) => (
          <DropdownMenuItem key={c.type} onClick={() => void call(c.type)} className="text-sm">
            <PhoneCall className="h-4 w-4 mr-2" />
            {c.type === "phone" && !isTelSupported() ? "Copiar número" : c.label}
          </DropdownMenuItem>
        ))}
        {available.length === 0 && (
          <DropdownMenuItem disabled className="text-xs">Nenhuma forma de ligação disponível</DropdownMenuItem>
        )}
        {phone && (
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(phone);
              toast.success("Número copiado");
            }}
            className="text-sm"
          >
            <Copy className="h-4 w-4 mr-2" /> Copiar número
          </DropdownMenuItem>
        )}
        {isAdmin && unavailable.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Indisponível
            </DropdownMenuLabel>
            {unavailable.map((c) => (
              <div key={c.type} className="px-2 py-1.5 text-[11px] text-muted-foreground flex gap-2">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  <b className="text-foreground/70">{c.label}:</b> {c.reason}
                </span>
              </div>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
