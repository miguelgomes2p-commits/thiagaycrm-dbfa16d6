/**
 * Inicialização das capacidades nativas (Capacitor / Android).
 * Tudo é no-op quando o app roda no navegador.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export async function initNative(onDeepLink?: (path: string) => void): Promise<void> {
  if (!isNativeApp()) return;

  try {
    document.documentElement.classList.add("is-native");

    const [{ App }, { StatusBar, Style }, { Keyboard }, { SplashScreen }] = await Promise.all([
      import("@capacitor/app"),
      import("@capacitor/status-bar"),
      import("@capacitor/keyboard"),
      import("@capacitor/splash-screen"),
    ]);

    await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    await StatusBar.setBackgroundColor({ color: "#FFFFFF" }).catch(() => {});

    // Esconde a splash só depois do app estar pronto (sensação de app nativo)
    setTimeout(() => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
    }, 300);


    Keyboard.addListener("keyboardWillShow", () => {
      document.documentElement.classList.add("keyboard-open");
    });
    Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.classList.remove("keyboard-open");
    });

    // Botão físico "voltar" do Android
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });

    // Deep links (https://crm.lupusassessoria.com/... e lupuscrm://...)
    App.addListener("appUrlOpen", ({ url }) => {
      try {
        const parsed = new URL(url);
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (path && path !== "/") onDeepLink?.(path);
      } catch {
        /* ignora urls inválidas */
      }
    });
  } catch {
    /* plugins indisponíveis — segue como web */
  }
}
