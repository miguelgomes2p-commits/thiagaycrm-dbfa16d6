import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type LabelLike = { id: string; name: string; color: string; kind?: "system" | "custom" };

// Best-effort readable text color for arbitrary hex background
function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma > 160 ? "#0b0b0b" : "#ffffff";
}

export function LabelBadge({
  label,
  size = "sm",
  onRemove,
  className,
  variant = "solid",
}: {
  label: LabelLike;
  size?: "xs" | "sm" | "md";
  onRemove?: () => void;
  className?: string;
  variant?: "solid" | "soft" | "outline";
}) {
  const sizeCls =
    size === "xs" ? "text-[10px] px-1.5 py-0.5 gap-1"
    : size === "md" ? "text-xs px-2.5 py-1 gap-1.5"
    : "text-[11px] px-2 py-0.5 gap-1";

  const style =
    variant === "solid"
      ? { backgroundColor: label.color, color: textColorFor(label.color) }
      : variant === "soft"
      ? { backgroundColor: `${label.color}22`, color: label.color, borderColor: `${label.color}55` }
      : { color: label.color, borderColor: `${label.color}77` };

  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center rounded-full font-medium leading-none whitespace-nowrap border",
        variant === "solid" && "border-transparent",
        sizeCls,
        className,
      )}
    >
      <span className="truncate max-w-[140px]">{label.name}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70 -mr-0.5"
          aria-label={`Remover ${label.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
