import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useLabels, type Label } from "@/hooks/useLabels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { LabelBadge } from "@/components/labels/LabelBadge";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/labels")({
  component: LabelsPage,
});

const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
];

function LabelsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const { data: labels } = useLabels(ws?.id);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Label | null>(null);
  const [open, setOpen] = useState(false);

  const system = (labels ?? []).filter((l) => l.kind === "system");
  const custom = (labels ?? []).filter((l) => l.kind === "custom");

  async function save(name: string, color: string) {
    if (!ws) return;
    if (editing) {
      const { error } = await supabase.from("labels")
        .update({ name, color }).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Etiqueta atualizada");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("labels").insert({
        workspace_id: ws.id, name, color, kind: "custom", scope: "conversation",
        created_by: u.user?.id, sort_order: (custom.length + 1) * 10,
      });
      if (error) return toast.error(error.message);
      toast.success("Etiqueta criada");
    }
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["labels", ws.id, "conversation"] });
  }

  async function remove(l: Label) {
    if (!confirm(`Apagar etiqueta "${l.name}"? Ela será removida de todas as conversas.`)) return;
    const { error } = await supabase.from("labels").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Etiqueta removida");
    qc.invalidateQueries({ queryKey: ["labels", ws?.id, "conversation"] });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">
            Organize conversas, contatos e leads. Etiquetas automáticas por número WhatsApp são criadas pelo sistema.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="gradient-brand text-primary-foreground border-0"
              onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 mr-1" /> Nova etiqueta
            </Button>
          </DialogTrigger>
          <LabelDialog editing={editing} onSave={save} />
        </Dialog>
      </div>

      <section className="card-elevated p-6">
        <h2 className="font-semibold mb-1">Personalizadas ({custom.length})</h2>
        <p className="text-xs text-muted-foreground mb-4">Criadas pela sua equipe. Podem ser editadas e removidas.</p>
        {custom.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
            Nenhuma etiqueta ainda. Crie a primeira para organizar suas conversas.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {custom.map((l) => (
              <div key={l.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <LabelBadge label={l} size="md" />
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(l)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-elevated p-6">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" /> Sistema ({system.length})
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Aplicadas automaticamente. Cada número WhatsApp cadastrado gera uma etiqueta.
        </p>
        {system.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">Nenhuma etiqueta de sistema.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {system.map((l) => <LabelBadge key={l.id} label={l} size="md" />)}
          </div>
        )}
      </section>
    </div>
  );
}

function LabelDialog({ editing, onSave }: { editing: Label | null; onSave: (name: string, color: string) => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(editing?.color ?? PALETTE[10]);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground">Nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: VIP, Aguardando pagamento..." autoFocus />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Cor</label>
          <div className="mt-2 grid grid-cols-9 gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? "hsl(var(--foreground))" : "transparent" }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Prévia</label>
          <div className="mt-2 p-4 rounded-lg bg-surface border border-border">
            {name.trim() ? (
              <LabelBadge label={{ id: "prev", name: name.trim(), color }} size="md" />
            ) : (
              <span className="text-xs text-muted-foreground">Digite um nome…</span>
            )}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() => name.trim() && onSave(name.trim(), color)}
          disabled={!name.trim()}
          className="gradient-brand text-primary-foreground border-0"
        >
          {editing ? "Salvar" : "Criar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
