import { useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getPushPublicKey, subscribeDevice, unsubscribeDevice, sendTestPush } from "@/lib/push.functions";
import { isIOS, isStandalone } from "@/lib/pwa";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Card discreto de Notificações Push (por dispositivo). Não altera nenhum fluxo existente. */
export function PushSettingsCard({ workspaceId }: { workspaceId: string | null }) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  const pubKeyFn = useServerFn(getPushPublicKey);
  const subFn = useServerFn(subscribeDevice);
  const unsubFn = useServerFn(unsubscribeDevice);
  const testFn = useServerFn(sendTestPush);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setActive(!!sub);
      } catch {
        /* ignora */
      }
    })();
  }, []);

  async function enable() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permissão de notificações negada pelo navegador.");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast.error("Notificações funcionam apenas no app publicado/instalado.");
        return;
      }
      const { publicKey } = await pubKeyFn();
      if (!publicKey) {
        toast.error("Push não está configurado no servidor.");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        }));

      await subFn({
        data: {
          workspaceId,
          endpoint: sub.endpoint,
          p256dh: bufToBase64Url(sub.getKey("p256dh")),
          auth: bufToBase64Url(sub.getKey("auth")),
          deviceLabel: isIOS() ? "iPhone/iPad" : /Android/.test(navigator.userAgent) ? "Android" : "Computador",
          userAgent: navigator.userAgent,
        },
      });
      setActive(true);
      toast.success("Notificações ativadas neste dispositivo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ativar as notificações");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setActive(false);
      toast.success("Notificações desativadas neste dispositivo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desativar");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const r = await testFn({ data: { workspaceId } });
      if (r.sent > 0) toast.success("Notificação de teste enviada");
      else toast.warning("Nenhum dispositivo ativo recebeu o teste.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste");
    } finally {
      setBusy(false);
    }
  }

  const iosNeedsInstall = supported && isIOS() && !isStandalone();

  return (
    <section className="card-elevated p-6">
      <div className="mb-4 flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Notificações Push</h2>
      </div>

      {!supported ? (
        <p className="text-sm text-muted-foreground">
          Este navegador não suporta notificações push.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Receba avisos de novos leads e mensagens mesmo quando o CRM não estiver aberto.
          </p>
          <div className="text-sm">
            Status: {active ? <span className="font-medium text-success">🟢 Ativadas</span> : <span className="font-medium text-destructive">🔴 Desativadas</span>}
          </div>

          {iosNeedsInstall && (
            <p className="rounded-md border border-border bg-surface/40 p-2 text-xs text-muted-foreground">
              No iPhone/iPad é necessário instalar o CRM na tela de início (Compartilhar → Adicionar à Tela de Início) para receber notificações.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!active ? (
              <Button size="sm" disabled={busy || !workspaceId} onClick={() => void enable()} className="cursor-pointer">
                <Bell className="mr-1 h-4 w-4" /> Ativar notificações
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void disable()} className="cursor-pointer">
                <BellOff className="mr-1 h-4 w-4" /> Desativar neste dispositivo
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy || !active} onClick={() => void test()} className="cursor-pointer">
              <Send className="mr-1 h-4 w-4" /> Enviar notificação de teste
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
