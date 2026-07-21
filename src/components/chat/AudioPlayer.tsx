import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  mime,
  variant = "light",
}: {
  src: string;
  mime?: string | null;
  variant?: "light" | "dark";
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onErr = () => setError(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, [src]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (a.paused) {
        await a.play();
        setPlaying(true);
      } else {
        a.pause();
        setPlaying(false);
      }
    } catch {
      setError(true);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const v = Number(e.target.value);
    a.currentTime = (v / 100) * duration;
    setCurrent(a.currentTime);
  };

  const isDark = variant === "dark";
  const pct = duration ? (current / duration) * 100 : 0;

  if (error) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        download
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
          isDark ? "bg-white/15 hover:bg-white/25 text-white" : "bg-black/10 hover:bg-black/20",
        )}
      >
        <Download className="h-4 w-4" />
        <span>Áudio ({mime?.split("/")[1] ?? "arquivo"}) — baixar</span>
      </a>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full px-3 py-2 min-w-[240px]",
        isDark ? "bg-white/15" : "bg-black/10",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn(
          "flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition",
          isDark
            ? "bg-white text-primary hover:bg-white/90"
            : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)" }}>
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", isDark ? "bg-white" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={pct}
            onChange={seek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Progresso"
          />
        </div>
        <div className={cn("text-[10px] font-mono tabular-nums", isDark ? "text-white/80" : "text-muted-foreground")}>
          {fmt(current)} / {fmt(duration)}
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}
