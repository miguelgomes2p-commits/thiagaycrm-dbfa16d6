import { MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type LocationPayload = {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
};

/** Extrai a localização de uma mensagem persistida (metadata.location). */
export function parseLocationMetadata(metadata: unknown): LocationPayload | null {
  if (!metadata || typeof metadata !== "object") return null;
  const loc = (metadata as { location?: unknown }).location;
  if (!loc || typeof loc !== "object") return null;
  const l = loc as Record<string, unknown>;
  const lat = Number(l["latitude"]);
  const lng = Number(l["longitude"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    latitude: lat,
    longitude: lng,
    name: typeof l["name"] === "string" ? l["name"] : null,
    address: typeof l["address"] === "string" ? l["address"] : null,
  };
}

export function mapsUrl(loc: LocationPayload) {
  const q = `${loc.latitude},${loc.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/**
 * Preview do mapa sem dependência de API paga: usa o embed público do
 * OpenStreetMap. Se a rede bloquear, o card continua funcional (fallback pin).
 */
function MapPreview({ loc }: { loc: LocationPayload }) {
  const d = 0.004;
  const bbox = [loc.longitude - d, loc.latitude - d, loc.longitude + d, loc.latitude + d].join("%2C");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.latitude}%2C${loc.longitude}`;
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-md bg-muted">
      <iframe
        title="Mapa"
        src={src}
        className="absolute inset-0 h-full w-full border-0 pointer-events-none"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <MapPin className="h-6 w-6 text-primary drop-shadow" />
      </div>
    </div>
  );
}

export function LocationMessageCard({
  loc,
  tone = "in",
}: {
  loc: LocationPayload;
  tone?: "in" | "out";
}) {
  const title = loc.name?.trim() || "Localização recebida";
  return (
    <div className={cn("w-64 max-w-full space-y-2 rounded-md border p-1.5", tone === "out" ? "border-white/20 bg-black/10" : "border-border bg-background/60")}>
      <MapPreview loc={loc} />
      <div className="px-1 pb-1 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </div>
        {loc.address && <p className="text-[11px] leading-snug opacity-80">{loc.address}</p>}
        {!loc.address && (
          <p className="text-[11px] opacity-60">
            {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
          </p>
        )}
        <a
          href={mapsUrl(loc)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
        >
          <ExternalLink className="h-3 w-3" /> Abrir no mapa
        </a>
      </div>
    </div>
  );
}
