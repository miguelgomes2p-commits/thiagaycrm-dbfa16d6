import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.lupusassessoria.crm",
  appName: "Lupus CRM",
  // App nativo de verdade: o bundle web fica DENTRO do APK (não é um atalho de navegador).
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    backgroundColor: "#FFFFFF",
  },
  server: {
    androidScheme: "https",
    // Domínios externos que o app pode abrir dentro da webview (OAuth / API).
    allowNavigation: [
      "crm.lupusassessoria.com",
      "thiagaycrm.lovable.app",
      "*.supabase.co",
      "accounts.google.com",
    ],
  },
  plugins: {
    Keyboard: {
      resize: "native",
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#FFFFFF",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
