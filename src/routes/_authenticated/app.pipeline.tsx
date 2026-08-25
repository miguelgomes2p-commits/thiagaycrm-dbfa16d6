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
import { Textarea } from "@/components/ui/textarea";
import { Plus, DollarSign, User as UserIcon, Flame, Clock, Info, Zap, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PipelineStagesManager } from "@/components/pipeline/PipelineStagesManager";
import { StageAutomationDialog } from "@/components/pipeline/StageAutomationDialog";
import { type LeadFields } from "@/components/pipeline/LeadQualifyFields";
import { LeadFieldsSection } from "@/components/leads/LeadFieldsSection";
import { LeadVehiclesPanel } from "@/components/vehicles/LeadVehiclesPanel";

import { useServerFn } from "@tanstack/react-start";
import { runStageAutomations } from "@/lib/automations.functions";

export const Route = createFileRoute("/_authenticated/app/pipeline")({
  component: PipelinePage,
});

type Stage = { id: string; name: string; color: string; type: string; position: number };
type Lead = {
  id: string; title: string; value: number | null; stage_id: string; priority: string;
  source: string | null; tags: string[] | null; created_at: string; last_interaction_at: string | null;
  notes: string | null; custom_fields: Record<string, string> | null; owner_id: string | null;
  contact_id?: string | null;
  contacts?: { name: string; company_name: string | null; phone?: string | null; birthdate?: string | null } | null;
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
  const isAdmin = ws?.role === "owner" || ws?.role === "admin" || ws?.role === "support" || ws?.role === "manager";
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [infoLead, setInfoLead] = useState<Lead | null>(null);
  const [automationStage, setAutomationStage] = useState<Stage | null>(null);
  const [newFields, setNewFields] = useState<LeadFields>({});
  const [editForm, setEditForm] = useState<null | {
    title: string; value: string; source: string; priority: string;
    stage_id: string; notes: string; custom_fields: LeadFields;
  }>(null);
  const runAutomationsFn = useServerFn(runStageAutomations);

  function startEdit(l: Lead) {
    setEditForm({
      title: l.title,
      value: String(l.value ?? ""),
      source: l.source ?? "",
      priority: l.priority,
      stage_id: l.stage_id,
      notes: l.notes ?? "",
      custom_fields: (l.custom_fields ?? {}) as LeadFields,
    });
  }

  async function saveEdit() {
    if (!infoLead || !editForm || !ws) return;
    const stage = pipelineQ.data?.stages.find((s) => s.id === editForm.stage_id);
    const patch: Record<string, unknown> = {
      title: editForm.title.trim() || infoLead.title,
      value: editForm.value === "" ? null : Number(editForm.value),
      source: editForm.source.trim() || null,
      priority: editForm.priority,
      stage_id: editForm.stage_id,
      notes: editForm.notes.trim() || null,
      custom_fields: Object.fromEntries(Object.entries(editForm.custom_fields).filter(([, v]) => v)),
      last_interaction_at: new Date().toISOString(),
    };
    if (stage?.type === "won") patch.won_at = new Date().toISOString();
    if (stage?.type === "lost") patch.lost_at = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("leads").update(patch as any).eq("id", infoLead.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead atualizado");
    setEditForm(null);
    setInfoLead(null);
    qc.invalidateQueries({ queryKey: ["pipeline", ws.id] });
    qc.invalidateQueries({ queryKey: ["dashboard", ws.id] });
  }


  function notAllowed() {
    toast.info("Sem permissão", {
      description: "Somente administradores do workspace podem personalizar etapas e criar automações.",
    });
  }


  const pipelineQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["pipeline", ws?.id],
    queryFn: async () => {
      const { data: pipes } = await supabase.from("pipelines").select("id, name").eq("workspace_id", ws!.id).order("position").limit(1);
      const pipe = pipes?.[0];
      if (!pipe) return { pipe: null, stages: [] as Stage[], leads: [] as Lead[], owners: new Map<string, string>() };
      const [{ data: stages, error: stagesError }, { data: leads, error: leadsError }] = await Promise.all([
        supabase.from("pipeline_stages").select("id, name, color, type, position").eq("pipeline_id", pipe.id).order("position"),
        supabase.from("leads").select("id, title, value, stage_id, priority, source, tags, created_at, last_interaction_at, notes, custom_fields, owner_id, contact_id, contacts:contact_id(name, company_name, phone, birthdate)").eq("pipeline_id", pipe.id).order("position"),
      ]);
      if (stagesError) throw stagesError;
      if (leadsError) throw leadsError;
      const leadList = (leads ?? []) as unknown as Lead[];
      const ownerIds = Array.from(new Set(leadList.map((l) => l.owner_id).filter((x): x is string => !!x)));
      const owners = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ownerIds);
        (profs ?? []).forEach((p) => owners.set(p.id, p.full_name ?? "Membro"));
      }
      return { pipe, stages: (stages ?? []) as Stage[], leads: leadList, owners };
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
    // Fire stage automations (WhatsApp messages, etc.) — non-blocking
    runAutomationsFn({ data: { leadId, stageId: newStageId } })
      .then((r) => {
        if (r?.ran && r.ran > 0) toast.success(`⚡ ${r.ran} automação(ões) enviada(s) pelo número da IA`);
        if (r?.scheduled && r.scheduled > 0) toast.success(`⏰ ${r.scheduled} follow-up(s) agendado(s)`);
      })
      .catch((e) => console.error("[automations]", (e as Error).message));

  }

  async function createLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ws || !pipelineQ.data?.pipe || !pipelineQ.data.stages[0]) return;
    const fd = new FormData(e.currentTarget);
    const { data: user } = await supabase.auth.getSession();
    const priority = (String(fd.get("priority") || "medium")) as "low" | "medium" | "high" | "urgent";
    const stageId = String(fd.get("stage_id") || "") || pipelineQ.data.stages[0].id;
    const { error } = await supabase.from("leads").insert({
      workspace_id: ws.id,
      pipeline_id: pipelineQ.data.pipe.id,
      stage_id: stageId,
      title: String(fd.get("title")),
      value: Number(fd.get("value") || 0),
      source: String(fd.get("source") || "") || null,
      priority,
      contact_id: String(fd.get("contact_id") || "") || null,
      notes: String(fd.get("notes") || "") || null,
      custom_fields: Object.fromEntries(Object.entries(newFields).filter(([, v]) => v)),
      owner_id: user.session?.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    const contactId = String(fd.get("contact_id") || "");
    const birthdate = String(fd.get("contact_birthdate") || "");
    if (contactId && birthdate) {
      await supabase.from("contacts").update({ birthdate }).eq("id", contactId);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    }
    toast.success("Lead criado");
    qc.invalidateQueries({ queryKey: ["pipeline", ws.id] });
    qc.invalidateQueries({ queryKey: ["dashboard", ws.id] });
    setNewFields({});
    setOpen(false);
  }

  async function deleteLead(leadId: string) {
    if (!ws) return;
    if (!confirm("Excluir este lead permanentemente? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("leads").delete().eq("id", leadId);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead excluído");
    setInfoLead(null);
    qc.invalidateQueries({ queryKey: ["pipeline", ws.id] });
    qc.invalidateQueries({ queryKey: ["dashboard", ws.id] });
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Arraste os cartões entre etapas.</p>
        </div>
        <div className="flex items-center gap-2">
          {pipelineQ.data?.pipe && ws && (
            isAdmin ? (
              <PipelineStagesManager pipelineId={pipelineQ.data.pipe.id} workspaceId={ws.id} />
            ) : (
              <Button variant="outline" onClick={notAllowed} title="Somente administradores">
                Personalizar etapas
              </Button>
            )
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-brand text-primary-foreground border-0"><Plus className="h-4 w-4 mr-1" /> Novo lead</Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
              <div>
                <Label>Data de nascimento do contato (opcional)</Label>
                <Input name="contact_birthdate" type="date" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Usada na automação de aniversário. É salva no cadastro do contato selecionado.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Etapa</Label>
                  <Select name="stage_id" defaultValue={pipelineQ.data?.stages[0]?.id}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pipelineQ.data?.stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
              </div>
              <div className="pt-2 border-t border-border">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Qualificação</h4>
                <LeadFieldsSection
                  workspaceId={ws?.id ?? null}
                  values={newFields}
                  onChange={(v) => setNewFields(v)}
                  context="CREATE_FROM_PIPELINE"
                  pipelineId={pipelineQ.data?.pipe?.id ?? null}
                />

              </div>
              <div><Label>Anotações</Label><Textarea name="notes" rows={3} placeholder="Observações sobre o lead" /></div>

              <Button type="submit" className="w-full gradient-brand text-primary-foreground border-0">Criar</Button>
            </form>
          </DialogContent>
          </Dialog>
        </div>
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
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: stage.color }} />
                    <span className="text-sm font-semibold truncate">{stage.name}</span>
                    <span className="text-xs text-muted-foreground">{leads.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => (isAdmin ? setAutomationStage(stage) : notAllowed())}
                      className={cn(
                        "p-1 rounded transition-colors",
                        isAdmin
                          ? "hover:bg-primary/10 text-muted-foreground hover:text-primary"
                          : "text-muted-foreground/40 hover:bg-muted",
                      )}
                      title={isAdmin ? "Configurar gatilhos" : "Somente administradores"}
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                        <div className="text-sm font-medium leading-tight flex-1">{l.title}</div>
                        <div className="flex items-center gap-1">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded", priorityColor[l.priority])}>
                            {l.priority === "urgent" && <Flame className="h-3 w-3 inline" />}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setInfoLead(l); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            draggable={false}
                            className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="Ver informações"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {l.contacts?.name && (
                        <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                          <UserIcon className="h-3 w-3" /> {l.contacts.name}
                        </div>
                      )}
                      {l.owner_id && pipelineQ.data?.owners.get(l.owner_id) && (
                        <div className="mt-1 text-[10px] text-primary/80 flex items-center gap-1">
                          <UserIcon className="h-2.5 w-2.5" /> Agente: <span className="font-medium text-foreground/90">{pipelineQ.data.owners.get(l.owner_id)}</span>
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

      <Dialog open={!!infoLead} onOpenChange={(o) => { if (!o) { setInfoLead(null); setEditForm(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{infoLead?.title}</DialogTitle>
          </DialogHeader>
          {infoLead && !editForm && (
            <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Valor" value={Number(infoLead.value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
                <InfoRow label="Prioridade" value={infoLead.priority} />
                <InfoRow label="Origem" value={infoLead.source ?? "—"} />
                <InfoRow label="Contato" value={infoLead.contacts?.name ?? "—"} />
                <InfoRow label="Agente" value={(infoLead.owner_id && pipelineQ.data?.owners.get(infoLead.owner_id)) || "—"} />
                {infoLead.contacts?.phone && <InfoRow label="Telefone" value={infoLead.contacts.phone} />}
                {infoLead.contacts?.company_name && <InfoRow label="Empresa" value={infoLead.contacts.company_name} />}
                {infoLead.contacts?.birthdate && (
                  <InfoRow label="Nascimento" value={new Date(`${infoLead.contacts.birthdate}T12:00:00`).toLocaleDateString("pt-BR")} />
                )}
              </div>
              {infoLead.contact_id && !infoLead.contacts?.birthdate && (
                <BirthdateNotice
                  contactId={infoLead.contact_id}
                  onSaved={() => {
                    qc.invalidateQueries({ queryKey: ["pipeline", ws?.id] });
                    setInfoLead(null);
                  }}
                />
              )}
              {infoLead.custom_fields && Object.keys(infoLead.custom_fields).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Qualificação</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(infoLead.custom_fields).filter(([, v]) => v).map(([k, v]) => (
                      <InfoRow key={k} label={k.replace(/_/g, " ")} value={String(v)} />
                    ))}
                  </div>
                </div>
              )}
              {ws?.id && (
                <div className="pt-2 border-t border-border">
                  <LeadVehiclesPanel leadId={infoLead.id} workspaceId={ws.id} />
                </div>
              )}
              {infoLead.notes && (
                <div className="pt-2 border-t border-border">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Anotações</h4>
                  <p className="text-xs whitespace-pre-wrap text-muted-foreground">{infoLead.notes}</p>
                </div>
              )}
              <div className="pt-3 border-t border-border flex justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => startEdit(infoLead)}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Editar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteLead(infoLead.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Excluir lead
                </Button>
              </div>
            </div>
          )}
          {infoLead && editForm && (
            <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
              <div><Label>Título</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" value={editForm.value}
                    onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} />
                </div>
                <div><Label>Origem</Label>
                  <Input value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Etapa</Label>
                  <Select value={editForm.stage_id} onValueChange={(v) => setEditForm({ ...editForm, stage_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pipelineQ.data?.stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Prioridade</Label>
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Qualificação</h4>
                <LeadFieldsSection
                  workspaceId={ws?.id ?? null}
                  values={editForm.custom_fields}
                  onChange={(v) => setEditForm({ ...editForm, custom_fields: v })}
                  context="LEAD_DETAIL"
                  pipelineId={pipelineQ.data?.pipe?.id ?? null}
                  stageId={editForm.stage_id}
                />

              </div>
              <div><Label>Anotações</Label>
                <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditForm(null)}>Cancelar</Button>
                <Button type="button" size="sm" className="gradient-brand text-primary-foreground border-0" onClick={saveEdit}>
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {automationStage && ws && (
        <StageAutomationDialog
          open={!!automationStage}
          onOpenChange={(v) => !v && setAutomationStage(null)}
          stageId={automationStage.id}
          stageName={automationStage.name}
          workspaceId={ws.id}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm capitalize-first">{value}</div>
    </div>
  );
}
