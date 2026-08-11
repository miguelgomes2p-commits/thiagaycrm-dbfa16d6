import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.lupusassessoria.crm",
  appName: "Lupus CRM",
  webDir: "dist/client",
  server: {
    // Carrega o app hospedado (hot-reload em produção, sem rebuild do APK a cada deploy).
    // Para empacotar o build local no APK, comente as 2 linhas abaixo e rode `npm run build`.
    url: "https://crm.lupusassessoria.com",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      "crm.lupusassessoria.com",
      "thiagaycrm.lovable.app",
      "*.supabase.co",
      "accounts.google.com",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#FFFFFF",
  },
  plugins: {
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
