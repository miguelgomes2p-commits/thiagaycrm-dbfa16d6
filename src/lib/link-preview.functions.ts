import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type LinkPreviewData = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

function pickMeta(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      return m[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    }
  }
  return undefined;
}

export const fetchLinkPreview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }): Promise<LinkPreviewData | null> => {
    try {
      const u = new URL(data.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(u.toString(), {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; LupusCRM-LinkPreview/1.0; +https://crm.lupusassessoria.com)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      }).catch(() => null);
      clearTimeout(to);
      if (!res || !res.ok) return null;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("text/html") && !ct.includes("xml")) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let html = "";
      const MAX = 200 * 1024;
      while (html.length < MAX) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch { /* noop */ }

      const title =
        pickMeta(html, [
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
          /<title[^>]*>([^<]+)<\/title>/i,
        ]) ?? undefined;
      const description = pickMeta(html, [
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      ]);
      let image = pickMeta(html, [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      ]);
      const siteName =
        pickMeta(html, [
          /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
        ]) ?? u.hostname.replace(/^www\./, "");

      if (image && image.startsWith("//")) image = u.protocol + image;
      else if (image && image.startsWith("/")) image = u.origin + image;

      if (!title && !description && !image) return { url: data.url, siteName };
      return { url: data.url, title, description, image, siteName };
    } catch {
      return null;
    }
  });
