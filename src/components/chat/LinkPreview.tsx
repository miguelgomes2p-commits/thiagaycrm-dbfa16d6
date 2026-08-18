import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchLinkPreview, type LinkPreviewData } from "@/lib/link-preview.functions";
import { cn } from "@/lib/utils";
import { Play, MapPin, Link as LinkIcon } from "lucide-react";

// URL regex — matches http(s) and bare www.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;

export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  if (!m || m.length === 0) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

// ---- WhatsApp inline formatting (*negrito*, _itálico_, ~riscado~, `mono`) ----
// O CRM recebe/envia o mesmo texto do WhatsApp; renderizamos a formatação em vez
// de exibir os marcadores crus para o atendente.
const WA_MARKS: Array<{ re: RegExp; wrap: (n: React.ReactNode, k: string) => React.ReactNode }> = [
  {
    re: /```([\s\S]+?)```/,
    wrap: (n, k) => (
      <code key={k} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.92em]">{n}</code>
    ),
  },
  {
    re: /`([^`\n]+?)`/,
    wrap: (n, k) => (
      <code key={k} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.92em]">{n}</code>
    ),
  },
  { re: /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/, wrap: (n, k) => <strong key={k} className="font-semibold">{n}</strong> },
  { re: /(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/, wrap: (n, k) => <em key={k}>{n}</em> },
  { re: /(?<![\w~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\w~])/, wrap: (n, k) => <s key={k}>{n}</s> },
];

function renderFormatted(text: string, keyPrefix: string): React.ReactNode[] {
  for (let i = 0; i < WA_MARKS.length; i++) {
    const mark = WA_MARKS[i]!;
    const m = mark.re.exec(text);
    if (!m || m.index === undefined) continue;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    return [
      ...(before ? renderFormatted(before, `${keyPrefix}b${i}`) : []),
      mark.wrap(renderFormatted(m[1] ?? "", `${keyPrefix}i${i}`), `${keyPrefix}m${i}`),
      ...(after ? renderFormatted(after, `${keyPrefix}a${i}`) : []),
    ];
  }
  return [text];
}

/** Remove os marcadores de formatação — útil para previews de uma linha. */
export function stripWaFormatting(text: string): string {
  return text
    .replace(/```([\s\S]+?)```/g, "$1")
    .replace(/`([^`\n]+?)`/g, "$1")
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, "$1")
    .replace(/(?<![\w~])~(?!\s)([^~\n]+?)(?<!\s)~(?![\w~])/g, "$1");
}

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "gi");
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const raw = match[0];
    if (start > lastIndex) parts.push(...renderFormatted(text.slice(lastIndex, start), `t${key}`));
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push(
      <a
        key={`u-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 text-info hover:text-info/80 break-all"
      >
        {raw}
      </a>,
    );
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) parts.push(...renderFormatted(text.slice(lastIndex), `t${key}e`));
  return <div className={cn("whitespace-pre-wrap break-words", className)}>{parts}</div>;
}


// ---- special-case detectors ----
function parseYouTube(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v") return parts[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function isGoogleMaps(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    return (
      h === "google.com" || h.endsWith(".google.com") || h === "goo.gl" || h === "maps.app.goo.gl"
    ) && (u.pathname.startsWith("/maps") || h.includes("maps") || h === "maps.app.goo.gl");
  } catch {
    return false;
  }
}

// ---- component ----
export function LinkPreview({ url, tone = "in" }: { url: string; tone?: "in" | "out" }) {
  const yt = parseYouTube(url);
  if (yt) return <YouTubePreview videoId={yt} url={url} />;
  if (isGoogleMaps(url)) return <MapsPreview url={url} tone={tone} />;
  return <GenericPreview url={url} tone={tone} />;
}

function CardShell({
  href,
  tone,
  children,
}: {
  href: string;
  tone: "in" | "out";
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block rounded-lg overflow-hidden border transition-colors no-underline",
        tone === "out"
          ? "border-white/20 bg-black/10 hover:bg-black/20"
          : "border-border bg-background/60 hover:bg-background",
      )}
    >
      {children}
    </a>
  );
}

function YouTubePreview({ videoId, url }: { videoId: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block relative rounded-lg overflow-hidden border border-border group no-underline"
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt="YouTube"
        className="w-full aspect-video object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/15 transition-colors">
        <div className="h-12 w-12 rounded-full bg-red-600/95 flex items-center justify-center shadow-lg">
          <Play className="h-6 w-6 text-white fill-white" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white bg-gradient-to-t from-black/70 to-transparent">
        YouTube
      </div>
    </a>
  );
}

function MapsPreview({ url, tone }: { url: string; tone: "in" | "out" }) {
  return (
    <CardShell href={url} tone={tone}>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-8 w-8 rounded bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
          <MapPin className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">Google Maps</div>
          <div className="text-[11px] opacity-70 truncate">{safeHost(url)}</div>
        </div>
      </div>
    </CardShell>
  );
}

function safeHost(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function GenericPreview({ url, tone }: { url: string; tone: "in" | "out" }) {
  const fetcher = useServerFn(fetchLinkPreview);
  const q = useQuery({
    queryKey: ["link-preview", url],
    queryFn: () => fetcher({ data: { url } }),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    retry: false,
  });
  const data: LinkPreviewData | null | undefined = q.data;
  if (q.isLoading) {
    return (
      <CardShell href={url} tone={tone}>
        <div className="px-3 py-2 flex items-center gap-2 text-[11px] opacity-70">
          <LinkIcon className="h-3 w-3" /> Carregando prévia…
        </div>
      </CardShell>
    );
  }
  if (!data || (!data.title && !data.description && !data.image)) {
    return (
      <CardShell href={url} tone={tone}>
        <div className="px-3 py-2 flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
            <LinkIcon className="h-4 w-4 opacity-70" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">{data?.siteName ?? safeHost(url)}</div>
            <div className="text-[11px] opacity-70 truncate">{url}</div>
          </div>
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell href={url} tone={tone}>
      {data.image && (
        <img
          src={data.image}
          alt=""
          className="w-full max-h-40 object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide opacity-60 truncate">
          {data.siteName ?? safeHost(url)}
        </div>
        {data.title && <div className="text-xs font-semibold line-clamp-2">{data.title}</div>}
        {data.description && (
          <div className="text-[11px] opacity-80 line-clamp-2 mt-0.5">{data.description}</div>
        )}
      </div>
    </CardShell>
  );
}
