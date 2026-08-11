import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, Download, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaItem = {
  id: string;
  url: string;
  type: "image" | "video" | "sticker";
  caption?: string | null;
  createdAt?: string | null;
};

/**
 * Visualizador de mídia estilo WhatsApp: botão voltar, navegação lateral
 * entre as mídias da conversa, teclado e swipe no mobile.
 */
export function MediaLightbox({
  items,
  startId,
  onClose,
}: {
  items: MediaItem[];
  startId: string | null;
  onClose: () => void;
}) {
  const initial = Math.max(0, items.findIndex((i) => i.id === startId));
  const [index, setIndex] = useState(initial === -1 ? 0 : initial);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    const i = items.findIndex((it) => it.id === startId);
    if (i >= 0) setIndex(i);
  }, [startId, items]);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(items.length - 1, Math.max(0, i + delta)));
  }, [items.length]);

  useEffect(() => {
    if (!startId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startId, go, onClose]);

  if (!startId || items.length === 0) return null;
  const current = items[index];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 animate-in fade-in"
      onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      <div className="flex items-center gap-2 px-3 py-3 text-white/90">
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{current.caption?.replace(/^📎\s*/, "") || "Mídia"}</div>
          <div className="text-[11px] opacity-60">
            {index + 1} de {items.length}
            {current.createdAt && ` · ${new Date(current.createdAt).toLocaleString("pt-BR")}`}
          </div>
        </div>
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="p-2 rounded-full hover:bg-white/10"
          aria-label="Baixar"
        >
          <Download className="h-5 w-5" />
        </a>
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-4">
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {current.type === "video" ? (
          <video src={current.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
        ) : (
          <img src={current.url} alt={current.caption ?? "mídia"} className="max-h-full max-w-full object-contain rounded-lg" />
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
            aria-label="Próxima"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-4">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "h-12 w-12 shrink-0 overflow-hidden rounded border-2 transition-colors",
                i === index ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              {it.type === "video"
                ? <div className="grid h-full w-full place-items-center bg-white/10 text-[10px] text-white">▶</div>
                : <img src={it.url} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
