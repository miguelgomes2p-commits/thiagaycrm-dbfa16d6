// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { execFileSync } from "node:child_process";
import { VitePWA } from "vite-plugin-pwa";


function resolveBuildSha(): string {
  const envSha =
    process.env["LOVABLE_BUILD_SHA"] ??
    process.env["VERCEL_GIT_COMMIT_SHA"] ??
    process.env["CF_PAGES_COMMIT_SHA"] ??
    process.env["GITHUB_SHA"];
  if (envSha) return envSha.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const buildSha = resolveBuildSha();

export default defineConfig({
  vite: {
    define: {
      __LUPUS_BUILD_SHA__: JSON.stringify(buildSha),
    },
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        outDir: "dist/client",
        devOptions: { enabled: false },
        includeAssets: ["favicon.png", "apple-touch-icon.png"],
        manifest: {
          name: "Lupus CRM",
          short_name: "Lupus CRM",
          description:
            "CRM conversacional com pipeline visual, inbox omnichannel e assistente IA.",
          lang: "pt-BR",
          display: "standalone",
          orientation: "portrait-primary",
          start_url: "/",
          scope: "/",
          theme_color: "#FFFFFF",
          background_color: "#FFFFFF",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,woff,woff2,png,jpeg,jpg,svg,ico}"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: false,
          navigationPreload: true,
          runtimeCaching: [
            {
              // HTML sempre da rede (nunca serve CRM antigo do cache)
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "lupus-html",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              // Apenas assets estáticos com hash do próprio domínio
              urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
                sameOrigin &&
                /\.(?:js|css|woff2?|png|jpe?g|svg|ico)$/.test(url.pathname) &&
                !url.pathname.startsWith("/api/") &&
                !url.pathname.startsWith("/~oauth"),
              handler: "CacheFirst",
              options: {
                cacheName: "lupus-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },

  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
