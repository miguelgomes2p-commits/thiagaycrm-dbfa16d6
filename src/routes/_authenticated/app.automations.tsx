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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Bell, Bot, Car, CheckCircle2, Clock, Filter, FlaskConical, Hourglass, ListChecks,
  MessageCircle, MinusCircle, Play, Plus, Save, Sparkles, Tag, Trash2, UserCheck, XCircle, Zap,
} from "lucide-react";
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
      { title: "Automações (Beta) | Lupus CRM" },
      { name: "description", content: "Crie automações simples: escolha um modelo pronto e deixe o CRM trabalhar por você." },
      { property: "og:title", content: "Automações (Beta) | Lupus CRM" },
      { property: "og:description", content: "Modelos prontos de automação para revendas de veículos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* ------------------------------------------------------------------ */
/* Textos amigáveis                                                    */
/* ------------------------------------------------------------------ */

const TRIGGER_HELP: Record<TriggerType, string> = {
  "lead.created": "Dispara toda vez que um novo lead entra no funil, venha de onde vier.",
  "lead.stage_changed": "Dispara quando alguém arrasta o card do lead para outra etapa do funil.",
  "vehicle.status_changed": "Dispara quando um veículo muda de situação (disponível, reservado, vendido...).",
  "lead_vehicle.linked": "Dispara quando um veículo do estoque é marcado como interesse de um lead.",
  "contact.birthday": "Roda 1x por dia, às 09h (horário de Brasília), e dispara para cada contato que faz aniversário no dia. Só funciona para contatos com data de nascimento cadastrada.",
};

const ACTION_HELP: Record<ActionType, string> = {
  send_whatsapp: "Manda uma mensagem no WhatsApp do contato do lead.",
  create_task: "Cria uma tarefa para o responsável não esquecer do próximo passo.",
  move_stage: "Move o card do lead para outra etapa do funil automaticamente.",
  assign_owner: "Define quem é o vendedor responsável pelo lead.",
  add_tag: "Coloca uma etiqueta no lead para facilitar filtros e buscas.",
  notify: "Mostra um aviso dentro do CRM para a equipe.",
  wait: "Espera um tempo antes de executar o próximo passo.",
};

const ACTION_ICON: Record<ActionType, typeof MessageCircle> = {
  send_whatsapp: MessageCircle,
  create_task: ListChecks,
  move_stage: Filter,
  assign_owner: UserCheck,
  add_tag: Tag,
  notify: Bell,
  wait: Hourglass,
};

const FIELD_LABEL: Record<string, string> = {
  "lead.title": "Título do lead",
  "lead.value": "Valor do negócio",
  "lead.source": "Origem do lead",
  "lead.priority": "Prioridade do lead",
  "lead.stage_id": "Etapa do funil",
  "lead.owner_id": "Responsável pelo lead",
  "contact.name": "Nome do contato",
  "contact.phone": "Telefone do contato",
  "contact.city": "Cidade do contato",
  "contact.birthdate": "Data de nascimento do contato",
  "vehicle.brand": "Marca do veículo",
  "vehicle.model": "Modelo do veículo",
  "vehicle.price": "Preço do veículo",
  "vehicle.status": "Situação do veículo",
  "vehicle.year_model": "Ano do veículo",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  published: { label: "Ativa", className: "bg-success/15 text-success" },
  paused: { label: "Pausada", className: "bg-warning/20 text-warning" },
  archived: { label: "Arquivada", className: "bg-muted text-muted-foreground" },
};

const BIRTHDAY_DEFAULT_MESSAGE =
  "Feliz aniversário, {{contact.name}}! 🎉 A equipe da City Car deseja a você um ano incrível. Aproveite condições especiais essa semana!";

function actionSummary(a: ActionNode): string {
  const cfg = a.config ?? {};
  const v = (k: string) => String(cfg[k] ?? "").trim();
  switch (a.type) {
    case "send_whatsapp": return v("message") ? `"${v("message").slice(0, 60)}${v("message").length > 60 ? "..." : ""}"` : "Escreva a mensagem que será enviada";
    case "create_task": return v("title") ? `Tarefa "${v("title")}"${v("due_in_days") ? ` em ${v("due_in_days")} dia(s)` : ""}` : "Defina o título da tarefa";
    case "move_stage": return v("stage_id") ? "Move o lead para a etapa escolhida" : "Informe a etapa de destino";
    case "assign_owner": return v("user_id") ? "Define o responsável escolhido" : "Informe quem será o responsável";
    case "add_tag": return v("tag") ? `Etiqueta "${v("tag")}"` : "Informe a etiqueta";
    case "notify": return v("title") ? `Aviso "${v("title")}"` : "Defina o aviso que a equipe verá";
    case "wait": return v("seconds") ? `Espera ${v("seconds")} segundo(s)` : "Defina quanto tempo esperar";
    default: return "";
  }
}

/* ------------------------------------------------------------------ */
/* Modelos prontos                                                     */
/* ------------------------------------------------------------------ */

type Template = { id: string; name: string; icon: typeof Sparkles; pitch: string; definition: AutomationDefinition };

const TEMPLATES: Template[] = [
  {
    id: "welcome",
    name: "Boas-vindas para lead novo",
    icon: MessageCircle,
    pitch: "Assim que um lead novo chega, ele recebe uma mensagem no WhatsApp em segundos.",
    definition: {
      trigger: { type: "lead.created", config: {} },
      conditions: { match: "all", rules: [] },
      actions: [{
        id: "a1", type: "send_whatsapp",
        config: { message: "Olá {{contact.name}}! Aqui é da Lupus Veículos. Recebemos seu contato e já vamos te atender. 🚗" },
      }],
    },
  },
  {
    id: "followup",
    name: "Lembrete de retorno em 24h",
    icon: ListChecks,
    pitch: "Cria uma tarefa para o vendedor retomar o contato no dia seguinte.",
    definition: {
      trigger: { type: "lead.created", config: {} },
      conditions: { match: "all", rules: [] },
      actions: [{ id: "a1", type: "create_task", config: { title: "Retornar contato com o lead", due_in_days: "1" } }],
    },
  },
  {
    id: "hot-lead",
    name: "Marcar lead quente ao escolher veículo",
    icon: Car,
    pitch: "Quando um veículo é vinculado ao lead, ele ganha a etiqueta 'quente' e a equipe é avisada.",
    definition: {
      trigger: { type: "lead_vehicle.linked", config: {} },
      conditions: { match: "all", rules: [] },
      actions: [
        { id: "a1", type: "add_tag", config: { tag: "quente" } },
        { id: "a2", type: "notify", config: { title: "Lead quente", body: "O lead demonstrou interesse em um veículo do estoque." } },
      ],
    },
  },
  {
    id: "sold",
    name: "Avisar equipe quando um veículo for vendido",
    icon: Bell,
    pitch: "Todo mundo fica sabendo na hora que um carro sai do estoque.",
    definition: {
      trigger: { type: "vehicle.status_changed", config: {} },
      conditions: { match: "all", rules: [{ field: "vehicle.status", op: "eq", value: "sold" }] },
      actions: [{ id: "a1", type: "notify", config: { title: "Veículo vendido 🎉", body: "{{vehicle.brand}} {{vehicle.model}} foi marcado como vendido." } }],
    },
  },
  {
    id: "birthday",
    name: "Mensagem de aniversário",
    icon: Sparkles,
    pitch: "Todo ano, no dia do aniversário do contato, ele recebe uma mensagem no WhatsApp às 09h.",
    definition: {
      trigger: { type: "contact.birthday", config: {} },
      conditions: { match: "all", rules: [] },
      actions: [{ id: "a1", type: "send_whatsapp", config: { message: BIRTHDAY_DEFAULT_MESSAGE } }],
    },
  },
];

/* ------------------------------------------------------------------ */

type StepResult = { node_id: string; node_type: string; status: string; detail: string | null; error: string | null };

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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [def, setDef] = useState<AutomationDefinition>(EMPTY_DEFINITION);
  const [test, setTest] = useState<{ matched: boolean; steps: StepResult[] } | null>(null);

  const execQ = useQuery({
    enabled: allowed && !!selected?.id,
    queryKey: ["automation-executions", selected?.id],
    queryFn: () => execFn({ data: { automationId: selected!.id } }),
  });

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDef((selected.draft_definition as AutomationDefinition) ?? EMPTY_DEFINITION);
    setTest(null);
    setEditing(true);
  }, [selected]);

  if (accessQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Verificando acesso...</div>;

  if (!allowed) {
    return (
      <div className="p-4 md:p-6">
        <Card className="max-w-lg mx-auto p-8 text-center space-y-3">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Automações estão chegando 🚀</h1>
          <p className="text-sm text-muted-foreground">
            Estamos testando este recurso com um grupo pequeno de revendas antes de liberar para todo mundo.
            Com ele, o CRM manda mensagens, cria tarefas e organiza seus leads sozinho.
          </p>
          <p className="text-sm text-muted-foreground">
            Quer participar do teste? Fale com o suporte da Lupus pelo WhatsApp e pedimos a liberação do seu acesso.
          </p>
          <Badge variant="secondary" className="text-[10px]">BETA PRIVADO</Badge>
        </Card>
      </div>
    );
  }

  function startFromTemplate(t: Template) {
    setSelected(null);
    setName(t.name);
    setDef({ ...t.definition, actions: t.definition.actions.map((a) => ({ ...a, id: crypto.randomUUID() })) });
    setTest(null);
    setEditing(true);
  }

  function startBlank() {
    setSelected(null);
    setName("Minha automação");
    setDef(EMPTY_DEFINITION);
    setTest(null);
    setEditing(true);
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
    if (!selected) { toast.info("Salve o rascunho antes de ativar"); return; }
    try {
      const res = await publishFn({ data: { id: selected.id } });
      toast.success(`Automação ativada (versão ${res.version})`);
      qc.invalidateQueries({ queryKey: ["automations", ws?.id] });
      setSelected({ ...selected, status: "published" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ativar");
    }
  }

  async function toggleRow(row: AutomationRow, on: boolean) {
    if (row.status === "draft") { toast.info("Abra a automação e ative pela primeira vez."); return; }
    await statusFn({ data: { id: row.id, status: on ? "published" : "paused" } });
    qc.invalidateQueries({ queryKey: ["automations", ws?.id] });
    if (selected?.id === row.id) setSelected({ ...selected, status: on ? "published" : "paused" });
    toast.success(on ? "Automação retomada" : "Automação pausada");
  }

  async function runTest() {
    if (!ws) return;
    try {
      const res = await testFn({ data: { workspaceId: ws.id, definition: def } });
      setTest({ matched: res.matched, steps: res.steps as StepResult[] });
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

  const rows = (listQ.data ?? []) as AutomationRow[];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Automações
            <Badge variant="secondary" className="text-[10px]">BETA</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Deixe o CRM cuidar das tarefas repetitivas por você.</p>
        </div>
        {editing && (
          <Button variant="outline" className="cursor-pointer" onClick={() => { setEditing(false); setSelected(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2 order-2 lg:order-1">
          <Button className="w-full cursor-pointer" onClick={startBlank}>
            <Plus className="h-4 w-4 mr-1.5" /> Criar do zero
          </Button>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground pt-1">Suas automações</p>
          {rows.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.draft!;
            return (
              <div key={a.id}
                className={cn("rounded-lg border border-border p-2.5 space-y-1.5", selected?.id === a.id && "border-primary bg-muted/50")}>
                <button type="button" onClick={() => setSelected(a)} className="w-full text-left cursor-pointer">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {TRIGGER_LABEL[a.trigger_type as TriggerType] ?? "Sem gatilho definido"}
                  </p>
                </button>
                <div className="flex items-center justify-between">
                  <Badge className={cn("border-0 text-[10px]", meta.className)}>{meta.label}</Badge>
                  <Switch
                    checked={a.status === "published"}
                    onCheckedChange={(v) => toggleRow(a, v)}
                    aria-label="Ativar ou pausar automação"
                  />
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma automação ainda.</p>}
        </aside>

        <section className="space-y-4 order-1 lg:order-2">
          {!editing ? (
            <>
              <div>
                <h2 className="text-base font-semibold">Comece por um modelo pronto</h2>
                <p className="text-sm text-muted-foreground">Escolha um exemplo, ajuste o texto e ative. Leva menos de um minuto.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATES.map((t) => (
                  <Card key={t.id} onClick={() => startFromTemplate(t)}
                    className="p-4 cursor-pointer transition-shadow hover:shadow-md space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <t.icon className="h-4 w-4" />
                      </span>
                      <p className="text-sm font-semibold">{t.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.pitch}</p>
                    <p className="text-[11px] text-primary font-medium">Usar este modelo →</p>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <>
              <Card className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <Label>Nome da automação</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="cursor-pointer" onClick={save}>
                      <Save className="h-4 w-4 mr-1.5" /> Salvar
                    </Button>
                    <Button variant="outline" className="cursor-pointer" onClick={runTest}>
                      <FlaskConical className="h-4 w-4 mr-1.5" /> Testar
                    </Button>
                    <Button className="cursor-pointer" onClick={publish}>
                      <Play className="h-4 w-4 mr-1.5" /> Ativar
                    </Button>
                  </div>
                </div>

                {/* Linha do tempo */}
                <div className="relative space-y-3 pl-8">
                  <span className="absolute left-3.5 top-4 bottom-4 w-px bg-border" />

                  <StepCard icon={Zap} tone="primary" step="1" title="Quando isso acontecer"
                    summary={TRIGGER_LABEL[def.trigger.type]} help={TRIGGER_HELP[def.trigger.type]}>
                    <Select value={def.trigger.type}
                      onValueChange={(v) => {
                        const type = v as TriggerType;
                        const next: AutomationDefinition = { ...def, trigger: { type, config: {} } };
                        if (type === "contact.birthday" && next.actions.length === 0) {
                          next.actions = [{
                            id: `a${Date.now()}`,
                            type: "send_whatsapp",
                            config: { message: BIRTHDAY_DEFAULT_MESSAGE },
                          }];
                        }
                        setDef(next);
                      }}>
                      <SelectTrigger className="w-full sm:max-w-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TRIGGER_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {def.trigger.type === "contact.birthday" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Este gatilho roda automaticamente 1x por dia, às 09h (horário de Brasília), e depende de o
                        contato ter a data de nascimento cadastrada no cadastro de contatos.
                      </p>
                    )}
                  </StepCard>

                  <StepCard icon={Filter} tone="muted" step="2" title="Só se (opcional)"
                    summary={def.conditions.rules.length === 0
                      ? "Sem filtros — vale para todos os casos"
                      : `${def.conditions.rules.length} filtro(s), ${def.conditions.match === "all" ? "todos precisam bater" : "basta um bater"}`}
                    help="Use filtros para restringir quando a automação deve rodar. Ex.: só leads da origem 'Site'.">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Select value={def.conditions.match}
                          onValueChange={(v) => setDef({ ...def, conditions: { ...def.conditions, match: v as "all" | "any" } })}>
                          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os filtros</SelectItem>
                            <SelectItem value="any">Qualquer filtro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="ghost" className="cursor-pointer"
                          onClick={() => setDef({ ...def, conditions: { ...def.conditions, rules: [...def.conditions.rules, { field: "lead.source", op: "eq", value: "" }] } })}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar filtro
                        </Button>
                      </div>
                      {def.conditions.rules.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <Select value={r.field} onValueChange={(v) => {
                            const rules = [...def.conditions.rules]; rules[i] = { ...r, field: v };
                            setDef({ ...def, conditions: { ...def.conditions, rules } });
                          }}>
                            <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CONTEXT_FIELDS.map((f) => <SelectItem key={f} value={f}>{FIELD_LABEL[f] ?? f}</SelectItem>)}
                            </SelectContent>
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
                          <Input className="h-8 text-xs flex-1 min-w-32" placeholder="Valor" value={r.value ?? ""} onChange={(e) => {
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
                    </div>
                  </StepCard>

                  {def.actions.map((a, idx) => {
                    const Icon = ACTION_ICON[a.type];
                    return (
                      <StepCard key={a.id} icon={Icon} tone="success" step={String(idx + 3)}
                        title={ACTION_LABEL[a.type]} summary={actionSummary(a)} help={ACTION_HELP[a.type]}
                        onRemove={() => removeAction(a.id)}>
                        <ActionConfig action={a} onChange={(cfg) => updateAction(a.id, { config: { ...a.config, ...cfg } })} />
                      </StepCard>
                    );
                  })}

                  <div className="relative">
                    <span className="absolute -left-[18px] top-2.5 grid h-6 w-6 place-items-center rounded-full border border-dashed border-border bg-background text-muted-foreground">
                      <Plus className="h-3 w-3" />
                    </span>
                    <Select value="" onValueChange={(v) => addAction(v as ActionType)}>
                      <SelectTrigger className="h-9 w-full sm:w-64 text-xs">
                        <SelectValue placeholder="Adicionar o que deve acontecer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACTION_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {test && (
                  <div className="rounded-xl border border-border p-3 space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <FlaskConical className="h-4 w-4 text-primary" /> Resultado do teste
                    </p>
                    {!test.matched ? (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MinusCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>Os filtros não bateram com o exemplo usado, então nada seria executado. Revise a etapa "Só se".</p>
                      </div>
                    ) : test.steps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma ação configurada para executar.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {test.steps.map((s) => {
                          const ok = s.status === "success" || s.status === "ok" || s.status === "simulated";
                          const skipped = s.status === "skipped";
                          const Icon = skipped ? MinusCircle : ok ? CheckCircle2 : XCircle;
                          return (
                            <li key={s.node_id} className="flex items-start gap-2 text-sm">
                              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0",
                                skipped ? "text-muted-foreground" : ok ? "text-success" : "text-destructive")} />
                              <div className="min-w-0">
                                <p className="font-medium">{ACTION_LABEL[s.node_type as ActionType] ?? s.node_type}</p>
                                <p className="text-xs text-muted-foreground break-words">
                                  {s.error ?? (skipped ? "Não foi executada neste teste" : ok ? "Executaria normalmente" : s.status)}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="text-[11px] text-muted-foreground">Nenhuma mensagem foi enviada de verdade — isto é só uma simulação.</p>
                  </div>
                )}
              </Card>

              {selected && (
                <Card className="p-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground" /> Últimas execuções
                  </p>
                  <div className="space-y-1">
                    {(execQ.data ?? []).map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs">
                        <span>{new Date(e.started_at).toLocaleString("pt-BR")}</span>
                        <Badge variant={e.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                          {e.status === "failed" ? "Falhou" : e.status === "success" ? "Concluída" : e.status}
                        </Badge>
                      </div>
                    ))}
                    {(execQ.data ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Ainda não rodou nenhuma vez.</p>
                    )}
                  </div>
                </Card>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StepCard({
  icon: Icon, tone, step, title, summary, help, children, onRemove,
}: {
  icon: typeof Zap; tone: "primary" | "muted" | "success"; step: string;
  title: string; summary: string; help: string; children: React.ReactNode; onRemove?: () => void;
}) {
  const toneClass = tone === "primary" ? "bg-primary text-primary-foreground"
    : tone === "success" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground";
  return (
    <div className="relative rounded-xl border border-border p-3 space-y-2 bg-card">
      <span className={cn("absolute -left-[30px] top-4 grid h-6 w-6 place-items-center rounded-full ring-4 ring-background", toneClass)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <span className="text-muted-foreground mr-1">{step}.</span>{title}
          </p>
          <p className="text-xs text-muted-foreground break-words">{summary}</p>
        </div>
        {onRemove && (
          <Button size="icon" variant="ghost" className="h-7 w-7 cursor-pointer shrink-0" onClick={onRemove} title="Remover passo">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {children}
      <p className="text-[11px] text-muted-foreground">{help}</p>
    </div>
  );
}

function ActionConfig({ action, onChange }: { action: ActionNode; onChange: (cfg: Record<string, string>) => void }) {
  const cfg = action.config ?? {};
  const val = (k: string) => String(cfg[k] ?? "");
  switch (action.type) {
    case "send_whatsapp":
      return (
        <div className="space-y-1">
          <Textarea rows={3} placeholder="Olá {{contact.name}}, tudo bem? Sobre o {{vehicle.model}}..."
            value={val("message")} onChange={(e) => onChange({ message: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">
            Use {"{{contact.name}}"}, {"{{vehicle.model}}"} ou {"{{vehicle.price}}"} para preencher automaticamente.
          </p>
        </div>
      );
    case "create_task":
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          <Input placeholder="O que precisa ser feito" value={val("title")} onChange={(e) => onChange({ title: e.target.value })} />
          <Input placeholder="Prazo em dias (ex.: 1)" inputMode="numeric" value={val("due_in_days")} onChange={(e) => onChange({ due_in_days: e.target.value })} />
        </div>
      );
    case "move_stage":
      return <Input placeholder="Identificador da etapa de destino" value={val("stage_id")} onChange={(e) => onChange({ stage_id: e.target.value })} />;
    case "assign_owner":
      return <Input placeholder="Identificador do vendedor responsável" value={val("user_id")} onChange={(e) => onChange({ user_id: e.target.value })} />;
    case "add_tag":
      return <Input placeholder="Nome da etiqueta (ex.: quente)" value={val("tag")} onChange={(e) => onChange({ tag: e.target.value })} />;
    case "notify":
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          <Input placeholder="Título do aviso" value={val("title")} onChange={(e) => onChange({ title: e.target.value })} />
          <Input placeholder="Detalhe do aviso" value={val("body")} onChange={(e) => onChange({ body: e.target.value })} />
        </div>
      );
    case "wait":
      return <Input placeholder="Esperar quantos segundos" inputMode="numeric" value={val("seconds")} onChange={(e) => onChange({ seconds: e.target.value })} />;
    default:
      return null;
  }
}
