import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const IDLE_MS = 30 * 60 * 1000; // 30 min de inatividade
const MAX_SESSION_MS = 8 * 60 * 60 * 1000; // 8 h máximo por sessão
const LAST_ACTIVITY_KEY = "lupus:lastActivity";
const SESSION_START_KEY = "lupus:sessionStart";

async function forceSignOut(reason: string) {
  try {
    await supabase.auth.signOut();
  } catch {
    /* noop */
  }
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  localStorage.removeItem(SESSION_START_KEY);
  toast.info(reason);
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
    window.location.replace("/auth");
  }
}

export function useSessionTimeout() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const markActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    };

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const now = Date.now();
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? now);
      const start = Number(localStorage.getItem(SESSION_START_KEY) ?? now);

      if (!localStorage.getItem(SESSION_START_KEY)) {
        localStorage.setItem(SESSION_START_KEY, String(now));
      }

      if (now - last > IDLE_MS) {
        await forceSignOut("Sessão encerrada por inatividade. Faça login novamente.");
      } else if (now - start > MAX_SESSION_MS) {
        await forceSignOut("Sessão expirada. Faça login novamente por segurança.");
      }
    };

    const events: string[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "visibilitychange",
    ];
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true } as AddEventListenerOptions));

    markActivity();

    interval = setInterval(check, 30_000);
    void check();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        localStorage.setItem(SESSION_START_KEY, String(Date.now()));
        markActivity();
      }
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        localStorage.removeItem(SESSION_START_KEY);
      }
    });

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      if (interval) clearInterval(interval);
      sub.subscription.unsubscribe();
    };
  }, []);
}
