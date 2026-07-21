import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, DollarSign, User as UserIcon, Flame, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PipelineStagesManager } from "@/components/pipeline/PipelineStagesManager";

export const Route = createFileRoute("/_authenticated/app/pipeline")({
  component: PipelinePage,
});

type Stage = { id: string; name: string; color: string; type: string; position: number };
type Lead = {
  id: string; title: string; value: number | null; stage_id: string; priority: string;
  source: string | null; tags: string[] | null; created_at: string; last_interaction_at: string | null;
  contacts?: { name: string; company_name: string | null } | null;
};

const priorityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/20 text-info",
  high: "bg-warning/20 text-warning",
  urgent: "bg-destructive/20 text-destructive",
};

function PipelinePage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const pipelineQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["pipeline", ws?.id],
    queryFn: async () => {
      const { data: pipes } = await supabase.from("pipelines").select("id, name").eq("workspace_id", ws!.id).order("position").limit(1);
      const pipe = pipes?.[0];
      if (!pipe) return { pipe: null, stages: [] as Stage[], leads: [] as Lead[] };
      const [{ data: stages }, { data: leads }] = await Promise.all([
        supabase.from("pipeline_stages").select("id, name, color, type, position").eq("pipeline_id", pipe.id).order("position"),
        supabase.from("leads").select("id, title, value, stage_id, priority, source, tags, created_at, last_interaction_at, contacts:contact_id(name, company_name)").eq("pipeline_id", pipe.id).order("position"),
      ]);
      return { pipe, stages: (stages ?? []) as Stage[], leads: (leads ?? []) as unknown as Lead[] };
    },
  });

  const contactsQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["contacts-lite", ws?.id],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, name").eq("workspace_id", ws!.id).order("name").limit(200);
      return data ?? [];
    },
  });

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    pipelineQ.data?.stages.forEach((s) => map.set(s.id, []));
    pipelineQ.data?.leads.forEach((l) => map.get(l.stage_id)?.push(l));
    return map;
  }, [pipelineQ.data]);

  async function moveLead(leadId: string, newStageId: string) {
    const stage = pipelineQ.data?.stages.find((s) => s.id === newStageId);
    const patch: Record<string, unknown> = { stage_id: newStageId, last_interaction_at: new Date().toISOString() };
    if (stage?.type === "won") patch.won_at = new Date().toISOString();
    if (stage?.type === "lost") patch.lost_at = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("leads").update(patch as any).eq("id", leadId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["pipeline", ws?.id] });
    qc.invalidateQueries({ queryKey: ["dashboard", ws?.id] });
    toast.success(`Movido para ${stage?.name}`);
  }

  async function createLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ws || !pipelineQ.data?.pipe || !pipelineQ.data.stages[0]) return;
    const fd = new FormData(e.currentTarget);
    const { data: user } = await supabase.auth.getUser();
    const priority = (String(fd.get("priority") || "medium")) as "low" | "medium" | "high" | "urgent";
    const { error } = await supabase.from("leads").insert({
      workspace_id: ws.id,
      pipeline_id: pipelineQ.data.pipe.id,
      stage_id: pipelineQ.data.stages[0].id,
      title: String(fd.get("title")),
      value: Number(fd.get("value") || 0),
      source: String(fd.get("source") || "") || null,
      priority,
      contact_id: String(fd.get("contact_id") || "") || null,
      owner_id: user.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Lead criado");
    qc.invalidateQueries({ queryKey: ["pipeline", ws.id] });
    qc.invalidateQueries({ queryKey: ["dashboard", ws.id] });
    setOpen(false);
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Arraste os cartões entre etapas.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-brand text-primary-foreground border-0"><Plus className="h-4 w-4 mr-1" /> Novo lead</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar lead</DialogTitle></DialogHeader>
            <form onSubmit={createLead} className="space-y-4">
              <div><Label>Título *</Label><Input name="title" required placeholder="Ex: Website para clínica" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label><Input name="value" type="number" step="0.01" placeholder="0,00" /></div>
                <div><Label>Origem</Label><Input name="source" placeholder="Instagram, indicação..." /></div>
              </div>
              <div><Label>Contato</Label>
                <Select name="contact_id">
                  <SelectTrigger><SelectValue placeholder="Selecione um contato" /></SelectTrigger>
                  <SelectContent>
                    {contactsQ.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Prioridade</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full gradient-brand text-primary-foreground border-0">Criar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-x-auto -mx-6 px-6">
        <div className="flex gap-4 h-full min-w-max">
          {pipelineQ.data?.stages.map((stage) => {
            const leads = byStage.get(stage.id) ?? [];
            const total = leads.reduce((s, l) => s + Number(l.value ?? 0), 0);
            return (
              <div
                key={stage.id}
                className="w-80 shrink-0 flex flex-col bg-surface/40 rounded-xl border border-border"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragging) { moveLead(dragging, stage.id); setDragging(null); } }}
              >
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                    <span className="text-sm font-semibold">{stage.name}</span>
                    <span className="text-xs text-muted-foreground">{leads.length}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {leads.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8">Sem leads</div>
                  )}
                  {leads.map((l) => (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragging(l.id)}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "card-elevated p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors",
                        dragging === l.id && "opacity-40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-tight">{l.title}</div>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded", priorityColor[l.priority])}>
                          {l.priority === "urgent" && <Flame className="h-3 w-3 inline" />}
                        </span>
                      </div>
                      {l.contacts?.name && (
                        <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                          <UserIcon className="h-3 w-3" /> {l.contacts.name}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1 text-success font-medium">
                          <DollarSign className="h-3 w-3" />
                          {Number(l.value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(l.last_interaction_at ?? l.created_at), { locale: ptBR, addSuffix: false })}
                        </span>
                      </div>
                      {l.source && <div className="mt-1 text-[10px] text-muted-foreground">via {l.source}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
