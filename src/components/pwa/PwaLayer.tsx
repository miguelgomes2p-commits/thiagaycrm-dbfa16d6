import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registerPwa, isStandalone, isIOS } from "@/lib/pwa";

const IOS_HINT_KEY = "lupus.pwa.ios-hint.dismissed";

/**
 * Camada visual da PWA: aviso de nova versão, status offline e dica de instalação no iOS.
 * Não interfere em rotas, dados ou autenticação.
 */
export function PwaLayer() {
  const [updateFn, setUpdateFn] = useState<(() => void) | null>(null);
  const [offline, setOffline] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) document.documentElement.classList.add("is-pwa");
    void registerPwa((update) => setUpdateFn(() => update));


    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    try {
      if (
        isIOS() &&
        !isStandalone() &&
        /Safari/.test(navigator.userAgent) &&
        !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) &&
        localStorage.getItem(IOS_HINT_KEY) !== "1"
      ) {
        setIosHint(true);
      }
    } catch {
      /* storage indisponível */
    }

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  function dismissIosHint() {
    setIosHint(false);
    try {
      localStorage.setItem(IOS_HINT_KEY, "1");
    } catch {
      /* ignora */
    }
  }

  return (
    <>
      {offline && (
        <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground pt-[max(0.5rem,env(safe-area-inset-top))]">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>Sem conexão com a internet — verifique sua conexão para continuar.</span>
        </div>
      )}

      {updateFn && (
        <div className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,26rem)] -translate-x-1/2 card-elevated flex items-center gap-3 p-3 mb-[env(safe-area-inset-bottom)]">
          <RefreshCw className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex-1 text-xs">
            <div className="font-medium">Nova versão disponível</div>
            <div className="text-muted-foreground">Atualize para receber as últimas melhorias.</div>
          </div>
          <Button size="sm" className="cursor-pointer" onClick={() => updateFn()}>
            Atualizar agora
          </Button>
        </div>
      )}

      {iosHint && (
        <div className="fixed bottom-4 left-1/2 z-[100] w-[min(92vw,26rem)] -translate-x-1/2 card-elevated p-3 mb-[env(safe-area-inset-bottom)]">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="flex-1 text-xs">
              <div className="font-medium">Instale o Lupus CRM no seu iPhone</div>
              <ol className="mt-1 space-y-0.5 text-muted-foreground">
                <li className="flex items-center gap-1">
                  1. Toque no botão Compartilhar <Share className="h-3 w-3" />
                </li>
                <li>2. Selecione &quot;Adicionar à Tela de Início&quot;</li>
                <li>3. Toque em &quot;Adicionar&quot;</li>
              </ol>
            </div>
            <button
              onClick={dismissIosHint}
              aria-label="Fechar"
              className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
