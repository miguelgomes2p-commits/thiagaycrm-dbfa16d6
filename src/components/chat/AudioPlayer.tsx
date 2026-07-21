import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(s: number) {
  if (!isFinite(s) || s < 0 || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// WhatsApp/Opus ogg files often report duration=Infinity until the browser
// scans the whole stream. Force a scan by seeking past the end, then reset.
async function forceDurationScan(a: HTMLAudioElement): Promise<number> {
  return new Promise((resolve) => {
    if (isFinite(a.duration) && a.duration > 0) return resolve(a.duration);
    const done = (dur: number) => {
      a.removeEventListener("durationchange", onDur);
      try { a.currentTime = 0; } catch { /* noop */ }
      resolve(dur);
    };
    const onDur = () => {
      if (isFinite(a.duration) && a.duration > 0) done(a.duration);
    };
    a.addEventListener("durationchange", onDur);
    try {
      a.currentTime = 1e6;
    } catch {
      done(0);
    }
    // safety timeout
    setTimeout(() => done(isFinite(a.duration) ? a.duration : 0), 3000);
  });
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
  const [rate, setRate] = useState(1);
  const scannedRef = useRef(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    scannedRef.current = false;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = async () => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      const dur = await forceDurationScan(a);
      setDuration(dur);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onErr = () => setError(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    if (a.readyState >= 1) onLoaded();
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
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
    if (!a || !duration || !isFinite(duration)) return;
    const v = Number(e.target.value);
    a.currentTime = (v / 100) * duration;
    setCurrent(a.currentTime);
  };

  const cycleRate = () => {
    const a = audioRef.current;
    if (!a) return;
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    a.playbackRate = next;
    setRate(next);
  };

  const isDark = variant === "dark";
  const pct = duration && isFinite(duration) ? (current / duration) * 100 : 0;

  // Fake waveform bars (deterministic, based on src hash)
  const bars = Array.from({ length: 32 }, (_, i) => {
    const seed = (src.charCodeAt((i * 3) % src.length) + i * 7) % 100;
    return 30 + (seed % 60);
  });

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
        <span>Áudio ({mime?.split("/")[1]?.split(";")[0] ?? "arquivo"}) — baixar</span>
      </a>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-2.5 min-w-[280px] max-w-[340px]",
        isDark ? "bg-white/10" : "bg-black/5",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn(
          "flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition shadow-sm",
          isDark
            ? "bg-white text-primary hover:bg-white/90"
            : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <div className="relative h-6 flex items-center">
          <div className="flex items-center gap-[2px] w-full h-full">
            {bars.map((h, i) => {
              const barPct = ((i + 1) / bars.length) * 100;
              const active = barPct <= pct;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-full transition-colors",
                    active
                      ? isDark ? "bg-white" : "bg-primary"
                      : isDark ? "bg-white/30" : "bg-black/25",
                  )}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
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
        <div className={cn("flex items-center justify-between text-[10px] font-mono tabular-nums", isDark ? "text-white/70" : "text-muted-foreground")}>
          <span>{fmt(current)} / {fmt(duration)}</span>
          <button
            type="button"
            onClick={cycleRate}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-semibold transition",
              isDark ? "bg-white/20 hover:bg-white/30 text-white" : "bg-black/10 hover:bg-black/20",
            )}
          >
            {rate}x
          </button>
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}
