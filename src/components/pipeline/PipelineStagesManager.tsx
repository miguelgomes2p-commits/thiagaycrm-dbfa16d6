import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, GripVertical, Trash2, Settings2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StageType = "open" | "won" | "lost";
type Role = "owner" | "admin" | "manager" | "agent";
const ALL_ROLES: Role[] = ["owner", "admin", "manager", "agent"];
type Stage = {
  id: string;
  name: string;
  color: string;
  type: StageType;
  position: number;
  allowed_roles: Role[];
};

const TYPE_LABEL: Record<StageType, string> = {
  open: "Em andamento",
  won: "Ganho",
  lost: "Perdido",
};

const PRESET_COLORS = [
  "#6366f1", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f97316",
  "#22c55e", "#ef4444", "#ec4899", "#14b8a6", "#a855f7",
  "#eab308", "#64748b",
];

const DEFAULT_STAGES: Omit<Stage, "id" | "position">[] = [
  { name: "Novo Lead", color: "#6366f1", type: "open", allowed_roles: [...ALL_ROLES] },
  { name: "Contato", color: "#0ea5e9", type: "open", allowed_roles: [...ALL_ROLES] },
  { name: "Qualificado", color: "#8b5cf6", type: "open", allowed_roles: [...ALL_ROLES] },
  { name: "Proposta", color: "#f59e0b", type: "open", allowed_roles: [...ALL_ROLES] },
  { name: "Negociação", color: "#f97316", type: "open", allowed_roles: [...ALL_ROLES] },
  { name: "Fechado Ganho", color: "#22c55e", type: "won", allowed_roles: [...ALL_ROLES] },
  { name: "Fechado Perdido", color: "#ef4444", type: "lost", allowed_roles: [...ALL_ROLES] },
];

export function PipelineStagesManager({
  pipelineId,
  workspaceId,
}: {
  pipelineId: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Stage[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const q = useQuery({
    enabled: open && !!pipelineId,
    queryKey: ["pipeline-stages-manage", pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, type, position, allowed_roles")
        .eq("pipeline_id", pipelineId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Stage[];
    },
  });

  useEffect(() => {
    if (q.data) setLocal(q.data.map((s) => ({ ...s })));
  }, [q.data]);

  function updateStage(id: string, patch: Partial<Stage>) {
    setLocal((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addStage() {
    const tempId = `new-${crypto.randomUUID()}`;
    setLocal((prev) => [
      ...prev,
      {
        id: tempId,
        name: "Nova etapa",
        color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
        type: "open",
        position: prev.length,
        allowed_roles: [...ALL_ROLES],
      },
    ]);
  }

  function removeStage(id: string) {
    setLocal((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, position: i })));
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setLocal((prev) => {
      const fromIdx = prev.findIndex((s) => s.id === dragId);
      const toIdx = prev.findIndex((s) => s.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next.map((s, i) => ({ ...s, position: i }));
    });
    setDragId(null);
  }

  async function save() {
    if (local.some((s) => !s.name.trim())) {
      toast.error("Todas as etapas precisam de um nome");
      return;
    }
    setSaving(true);
    try {
      const original = q.data ?? [];
      const originalIds = new Set(original.map((s) => s.id));
      const localIds = new Set(local.filter((s) => !s.id.startsWith("new-")).map((s) => s.id));

      // Delete removed — reassign any leads to a remaining stage first
      const toDelete = original.filter((s) => !localIds.has(s.id)).map((s) => s.id);
      if (toDelete.length) {
        // Pick a fallback stage from the ones being kept (prefer an "open" one)
        const remaining = local.filter((s) => !s.id.startsWith("new-"));
        const fallback =
          remaining.find((s) => s.type === "open") ?? remaining[0];

        if (!fallback) {
          toast.error("Deixe ao menos uma etapa antes de excluir as outras.");
          setSaving(false);
          return;
        }

        const { data: affected, error: findErr } = await supabase
          .from("leads")
          .select("id")
          .eq("pipeline_id", pipelineId)
          .in("stage_id", toDelete);
        if (findErr) throw findErr;

        if (affected && affected.length > 0) {
          const { error: moveErr } = await supabase
            .from("leads")
            .update({ stage_id: fallback.id })
            .in("id", affected.map((l) => l.id));
          if (moveErr) throw moveErr;
          toast.message(`${affected.length} lead(s) movido(s) para "${fallback.name}"`);
        }

        const { error } = await supabase.from("pipeline_stages").delete().in("id", toDelete);
        if (error) throw error;
      }

      // Upsert existing + insert new
      const toInsert = local
        .filter((s) => s.id.startsWith("new-"))
        .map((s) => ({
          pipeline_id: pipelineId,
          workspace_id: workspaceId,
          name: s.name.trim(),
          color: s.color,
          type: s.type,
          position: s.position,
          allowed_roles: s.allowed_roles,
        }));
      if (toInsert.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("pipeline_stages").insert(toInsert as any);
        if (error) throw error;
      }

      const toUpdate = local.filter((s) => originalIds.has(s.id));
      for (const s of toUpdate) {
        const orig = original.find((o) => o.id === s.id);
        if (!orig) continue;
        const rolesChanged =
          (orig.allowed_roles ?? []).slice().sort().join(",") !==
          (s.allowed_roles ?? []).slice().sort().join(",");
        if (
          orig.name !== s.name ||
          orig.color !== s.color ||
          orig.type !== s.type ||
          orig.position !== s.position ||
          rolesChanged
        ) {
          const { error } = await supabase
            .from("pipeline_stages")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ name: s.name.trim(), color: s.color, type: s.type, position: s.position, allowed_roles: s.allowed_roles } as any)
            .eq("id", s.id);
          if (error) throw error;
        }
      }

      toast.success("Etapas salvas");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["pipeline-stages-manage", pipelineId] });
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    setSaving(true);
    try {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", pipelineId);
      if ((count ?? 0) > 0) {
        toast.error("Existe leads na pipeline. Mova-os para outra pipeline antes de restaurar.");
        setSaving(false);
        return;
      }
      const { error: delErr } = await supabase.from("pipeline_stages").delete().eq("pipeline_id", pipelineId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("pipeline_stages").insert(
        DEFAULT_STAGES.map((s, i) => ({
          pipeline_id: pipelineId,
          workspace_id: workspaceId,
          name: s.name,
          color: s.color,
          type: s.type,
          position: i,
          allowed_roles: s.allowed_roles,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any,
      );
      if (insErr) throw insErr;
      toast.success("Etapas restauradas");
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["pipeline-stages-manage", pipelineId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings2 className="h-4 w-4 mr-1.5" /> Personalizar etapas
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Etapas do Pipeline</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {local.map((stage) => (
            <div
              key={stage.id}
              draggable
              onDragStart={() => setDragId(stage.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage.id)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "flex flex-col gap-3 p-3 rounded-lg border border-border bg-surface/40",
                dragId === stage.id && "opacity-40",
              )}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <span
                  className="h-4 w-4 rounded-full border border-border shrink-0"
                  style={{ background: stage.color }}
                />
                <Input
                  value={stage.name}
                  onChange={(e) => updateStage(stage.id, { name: e.target.value })}
                  className="flex-1"
                  placeholder="Nome da etapa"
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir "{stage.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se houver leads nesta etapa, eles serão movidos automaticamente para outra etapa da pipeline.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => removeStage(stage.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="flex items-center gap-2 pl-6">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select
                    value={stage.type}
                    onValueChange={(v) => updateStage(stage.id, { type: v as StageType })}
                  >
                    <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["open", "won", "lost"] as StageType[]).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Cor</Label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="color"
                      value={stage.color}
                      onChange={(e) => updateStage(stage.id, { color: e.target.value })}
                      className="h-8 w-8 rounded border border-border cursor-pointer bg-transparent"
                    />
                    <div className="flex flex-wrap gap-1">
                      {PRESET_COLORS.slice(0, 6).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateStage(stage.id, { color: c })}
                          className={cn(
                            "h-5 w-5 rounded-full border transition",
                            stage.color === c ? "border-foreground scale-110" : "border-border",
                          )}
                          style={{ background: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addStage} className="w-full">
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar etapa
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2 pt-4 border-t border-border">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restaurar padrão
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restaurar etapas padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso apaga todas as etapas atuais e recria as 7 padrão. Só funciona se a pipeline não tiver leads.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={restoreDefaults}>Restaurar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="gradient-brand text-primary-foreground border-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
