import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, FlaskConical, Lock, Play, Plus, Save, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTION_LABEL, CONDITION_OP_LABEL, CONTEXT_FIELDS, EMPTY_DEFINITION, TRIGGER_LABEL,
  type ActionNode, type ActionType, type AutomationDefinition, type AutomationRow,
  type ConditionOp, type TriggerType,
} from "@/lib/automation-types";
import {
  getAutomationAccess, listAutomationExecutions, listAutomations, publishAutomation,
  saveAutomation, setAutomationStatus, testAutomation,
} from "@/lib/automation-studio.functions";

export const Route = createFileRoute("/_authenticated/app/automations")({
  component: AutomationStudioPage,
  head: () => ({
    meta: [
      { title: "Automation Studio (Beta) | Lupus CRM" },
      { name: "description", content: "Crie automações visuais com gatilhos, condições e ações dentro do Lupus CRM." },
      { property: "og:title", content: "Automation Studio (Beta) | Lupus CRM" },
      { property: "og:description", content: "Editor visual de automações em beta privado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AutomationStudioPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const qc = useQueryClient();

  const accessFn = useServerFn(getAutomationAccess);
  const listFn = useServerFn(listAutomations);
  const saveFn = useServerFn(saveAutomation);
  const publishFn = useServerFn(publishAutomation);
  const statusFn = useServerFn(setAutomationStatus);
  const testFn = useServerFn(testAutomation);
  const execFn = useServerFn(listAutomationExecutions);

  const accessQ = useQuery({ queryKey: ["automation-access"], queryFn: () => accessFn({}) });
  const allowed = !!accessQ.data?.allowed;

  const listQ = useQuery({
    enabled: allowed && !!ws?.id,
    queryKey: ["automations", ws?.id],
    queryFn: () => listFn({ data: { workspaceId: ws!.id } }),
  });

  const [selected, setSelected] = useState<AutomationRow | null>(null);
  const [name, setName] = useState("");
  const [def, setDef] = useState<AutomationDefinition>(EMPTY_DEFINITION);
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const execQ = useQuery({
    enabled: allowed && !!selected?.id,
    queryKey: ["automation-executions", selected?.id],
    queryFn: () => execFn({ data: { automationId: selected!.id } }),
  });

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDef((selected.draft_definition as AutomationDefinition) ?? EMPTY_DEFINITION);
    setTestOutput(null);
  }, [selected]);

  if (accessQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Verificando acesso...</div>;

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto p-8 text-center space-y-3">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Automation Studio</h1>
          <p className="text-sm text-muted-foreground">
            Este módulo está em <strong>beta privado</strong> e ainda não foi liberado para a sua conta.
          </p>
        </Card>
      </div>
    );
  }

  async function newAutomation() {
    setSelected(null);
    setName("Nova automação");
    setDef(EMPTY_DEFINITION);
  }

  async function save() {
    if (!ws) return;
    try {
      const res = await saveFn({
        data: { workspaceId: ws.id, id: selected?.id ?? null, name: name.trim() || "Sem título", definition: def },
      });
      toast.success("Rascunho salvo");
      qc.invalidateQueries({ queryKey: ["automations", ws.id] });
      if (!selected) {
        const rows = await listFn({ data: { workspaceId: ws.id } });
        setSelected((rows as AutomationRow[]).find((r) => r.id === res.id) ?? null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  async function publish() {
    if (!selected) { toast.info("Salve o rascunho antes de publicar"); return; }
    try {
      const res = await publishFn({ data: { id: selected.id } });
      toast.success(`Publicada (versão ${res.version})`);
      qc.invalidateQueries({ queryKey: ["automations", ws?.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar");
    }
  }

  async function togglePause() {
    if (!selected) return;
    const next = selected.status === "paused" ? "published" : "paused";
    await statusFn({ data: { id: selected.id, status: next } });
    qc.invalidateQueries({ queryKey: ["automations", ws?.id] });
    setSelected({ ...selected, status: next });
  }

  async function runTest() {
    if (!ws) return;
    try {
      const res = await testFn({ data: { workspaceId: ws.id, definition: def } });
      setTestOutput(
        res.matched
          ? res.steps.map((s) => `• ${ACTION_LABEL[s.node_type as ActionType] ?? s.node_type}: ${s.status}${s.detail ? ` — ${s.detail}` : ""}`).join("\n")
          : "As condições não foram atendidas com o contexto de teste.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na simulação");
    }
  }

  function addAction(type: ActionType) {
    setDef((d) => ({ ...d, actions: [...d.actions, { id: crypto.randomUUID(), type, config: {} }] }));
  }

  function updateAction(id: string, patch: Partial<ActionNode>) {
    setDef((d) => ({ ...d, actions: d.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }

  function removeAction(id: string) {
    setDef((d) => ({ ...d, actions: d.actions.filter((a) => a.id !== id) }));
  }

  return (
    <div className="p-4 md:p-6 grid lg:grid-cols-[280px_1fr] gap-4">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Automações
          </h1>
          <Badge variant="secondary" className="text-[10px]">BETA</Badge>
        </div>
        <Button className="w-full cursor-pointer" onClick={newAutomation}>
          <Plus className="h-4 w-4 mr-1.5" /> Nova automação
        </Button>
        <div className="space-y-1">
          {((listQ.data ?? []) as AutomationRow[]).map((a) => (
            <button key={a.id} type="button" onClick={() => setSelected(a)}
              className={cn("w-full text-left rounded-md border border-border p-2 cursor-pointer hover:bg-muted/60",
                selected?.id === a.id && "bg-muted")}>
              <p className="text-sm font-medium truncate">{a.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {TRIGGER_LABEL[a.trigger_type as TriggerType] ?? "Sem gatilho"} · {a.status}
              </p>
            </button>
          ))}
          {((listQ.data ?? []) as AutomationRow[]).length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma automação criada.</p>
          )}
        </div>
      </aside>

      <section className="space-y-4">
        <Card className="p-4 space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button variant="outline" className="cursor-pointer" onClick={save}>
              <Save className="h-4 w-4 mr-1.5" /> Salvar
            </Button>
            <Button variant="outline" className="cursor-pointer" onClick={runTest}>
              <FlaskConical className="h-4 w-4 mr-1.5" /> Simular
            </Button>
            <Button className="cursor-pointer" onClick={publish}>
              <Play className="h-4 w-4 mr-1.5" /> Publicar
            </Button>
            {selected && (
              <Button variant="outline" className="cursor-pointer" onClick={togglePause}>
                {selected.status === "paused" ? "Retomar" : "Pausar"}
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" /> Quando (gatilho)
            </p>
            <Select value={def.trigger.type}
              onValueChange={(v) => setDef({ ...def, trigger: { type: v as TriggerType, config: {} } })}>
              <SelectTrigger className="w-full max-w-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Se (condições)</p>
              <div className="flex items-center gap-2">
                <Select value={def.conditions.match}
                  onValueChange={(v) => setDef({ ...def, conditions: { ...def.conditions, match: v as "all" | "any" } })}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="any">Qualquer uma</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="cursor-pointer"
                  onClick={() => setDef({ ...def, conditions: { ...def.conditions, rules: [...def.conditions.rules, { field: "lead.source", op: "eq", value: "" }] } })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Condição
                </Button>
              </div>
            </div>
            {def.conditions.rules.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={r.field} onValueChange={(v) => {
                  const rules = [...def.conditions.rules]; rules[i] = { ...r, field: v };
                  setDef({ ...def, conditions: { ...def.conditions, rules } });
                }}>
                  <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTEXT_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={r.op} onValueChange={(v) => {
                  const rules = [...def.conditions.rules]; rules[i] = { ...r, op: v as ConditionOp };
                  setDef({ ...def, conditions: { ...def.conditions, rules } });
                }}>
                  <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITION_OP_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="h-8 text-xs flex-1" value={r.value ?? ""} onChange={(e) => {
                  const rules = [...def.conditions.rules]; rules[i] = { ...r, value: e.target.value };
                  setDef({ ...def, conditions: { ...def.conditions, rules } });
                }} />
                <Button size="icon" variant="ghost" className="h-8 w-8 cursor-pointer" onClick={() => {
                  setDef({ ...def, conditions: { ...def.conditions, rules: def.conditions.rules.filter((_, x) => x !== i) } });
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {def.conditions.rules.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem condições — a automação roda para todos os eventos do gatilho.</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Então (ações)</p>
              <Select onValueChange={(v) => addAction(v as ActionType)}>
                <SelectTrigger className="h-7 w-56 text-xs"><SelectValue placeholder="Adicionar ação..." /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {def.actions.map((a, idx) => (
              <div key={a.id} className="rounded-md border border-border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">{idx + 1}. {ACTION_LABEL[a.type]}</p>
                  <Button size="icon" variant="ghost" className="h-7 w-7 cursor-pointer" onClick={() => removeAction(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <ActionConfig action={a} onChange={(cfg) => updateAction(a.id, { config: { ...a.config, ...cfg } })} />
              </div>
            ))}
            {def.actions.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ação configurada.</p>}
          </div>

          {testOutput && (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Resultado da simulação</p>
              <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{testOutput}</pre>
            </div>
          )}
        </Card>

        {selected && (
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Execuções recentes</p>
            <div className="space-y-1">
              {(execQ.data ?? []).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs">
                  <span>{new Date(e.started_at).toLocaleString("pt-BR")}</span>
                  <Badge variant={e.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                    {e.status}
                  </Badge>
                </div>
              ))}
              {(execQ.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma execução registrada.</p>}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function ActionConfig({ action, onChange }: { action: ActionNode; onChange: (cfg: Record<string, string>) => void }) {
  const cfg = action.config ?? {};
  const val = (k: string) => String(cfg[k] ?? "");
  switch (action.type) {
    case "send_whatsapp":
      return (
        <Textarea rows={3} placeholder="Olá {{contact.name}}, tudo bem? Sobre o {{vehicle.model}}..."
          value={val("message")} onChange={(e) => onChange({ message: e.target.value })} />
      );
    case "create_task":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Título da tarefa" value={val("title")} onChange={(e) => onChange({ title: e.target.value })} />
          <Input placeholder="Prazo (dias)" inputMode="numeric" value={val("due_in_days")} onChange={(e) => onChange({ due_in_days: e.target.value })} />
        </div>
      );
    case "move_stage":
      return <Input placeholder="ID da etapa de destino" value={val("stage_id")} onChange={(e) => onChange({ stage_id: e.target.value })} />;
    case "assign_owner":
      return <Input placeholder="ID do usuário responsável" value={val("user_id")} onChange={(e) => onChange({ user_id: e.target.value })} />;
    case "add_tag":
      return <Input placeholder="Etiqueta" value={val("tag")} onChange={(e) => onChange({ tag: e.target.value })} />;
    case "notify":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Título" value={val("title")} onChange={(e) => onChange({ title: e.target.value })} />
          <Input placeholder="Mensagem" value={val("body")} onChange={(e) => onChange({ body: e.target.value })} />
        </div>
      );
    case "wait":
      return <Input placeholder="Aguardar (segundos)" inputMode="numeric" value={val("seconds")} onChange={(e) => onChange({ seconds: e.target.value })} />;
    default:
      return null;
  }
}
