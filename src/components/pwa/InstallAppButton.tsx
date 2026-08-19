import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStandalone, isIOS } from "@/lib/pwa";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Botão discreto "Instalar aplicativo" — some quando já instalado ou não suportado. */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (isIOS()) {
      setShowIosHelp(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setDeferred(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (showIosHelp) {
    return (
      <p className="text-xs text-muted-foreground">
        No iPhone/iPad: toque em <strong>Compartilhar</strong> e depois em{" "}
        <strong>Adicionar à Tela de Início</strong> para instalar o Lupus CRM.
      </p>
    );
  }

  if (!deferred) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="cursor-pointer gap-2"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice.catch(() => null);
        setDeferred(null);
      }}
    >
      <Download className="h-4 w-4" /> Instalar aplicativo
    </Button>
  );
}
