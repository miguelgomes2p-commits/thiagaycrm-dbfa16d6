import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Tag, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Label } from "@/hooks/useLabels";

export function LabelPicker({
  labels,
  activeIds,
  onToggle,
  trigger,
  align = "end",
}: {
  labels: Label[];
  activeIds: string[];
  onToggle: (labelId: string, currentlyActive: boolean) => void;
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = labels.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
  const active = new Set(activeIds);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5">
            <Tag className="h-3.5 w-3.5" /> Etiquetas
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Buscar etiqueta..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma etiqueta.<br />
              <a href="/app/labels" className="text-primary hover:underline inline-flex items-center gap-1 mt-2">
                <Plus className="h-3 w-3" /> Criar nova
              </a>
            </div>
          )}
          {filtered.map((l) => {
            const isActive = active.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => onToggle(l.id, isActive)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface/80 transition-colors text-left",
                )}
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0 border border-border/50"
                  style={{ backgroundColor: l.color }}
                />
                <span className="flex-1 truncate">{l.name}</span>
                {l.kind === "system" && (
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">auto</span>
                )}
                {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <a
            href="/app/labels"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Gerenciar etiquetas
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
