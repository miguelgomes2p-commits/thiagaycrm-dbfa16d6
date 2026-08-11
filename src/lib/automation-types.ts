/**
 * Automation Studio — tipos compartilhados da definição (JSON versionado).
 * Este arquivo é seguro para o cliente (apenas tipos e helpers puros).
 */

export type TriggerType =
  | "lead.created"
  | "lead.stage_changed"
  | "vehicle.status_changed"
  | "lead_vehicle.linked";

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  "lead.created": "Lead criado",
  "lead.stage_changed": "Lead mudou de etapa",
  "vehicle.status_changed": "Veículo mudou de status",
  "lead_vehicle.linked": "Veículo vinculado a um lead",
};

export type ConditionOp =
  | "eq" | "neq" | "contains" | "gt" | "lt" | "is_empty" | "is_not_empty";

export const CONDITION_OP_LABEL: Record<ConditionOp, string> = {
  eq: "é igual a",
  neq: "é diferente de",
  contains: "contém",
  gt: "maior que",
  lt: "menor que",
  is_empty: "está vazio",
  is_not_empty: "está preenchido",
};

export type ConditionRule = { field: string; op: ConditionOp; value?: string };

export type ActionType =
  | "send_whatsapp"
  | "create_task"
  | "move_stage"
  | "assign_owner"
  | "add_tag"
  | "notify"
  | "wait";

export const ACTION_LABEL: Record<ActionType, string> = {
  send_whatsapp: "Enviar mensagem no WhatsApp",
  create_task: "Criar tarefa",
  move_stage: "Mover lead de etapa",
  assign_owner: "Atribuir responsável",
  add_tag: "Adicionar etiqueta ao lead",
  notify: "Notificar no CRM",
  wait: "Aguardar",
};

export type ActionNode = {
  id: string;
  type: ActionType;
  config: Record<string, string | number | null>;
};

export type AutomationDefinition = {
  trigger: { type: TriggerType; config?: Record<string, string | null> };
  conditions: { match: "all" | "any"; rules: ConditionRule[] };
  actions: ActionNode[];
};

export const EMPTY_DEFINITION: AutomationDefinition = {
  trigger: { type: "lead.created", config: {} },
  conditions: { match: "all", rules: [] },
  actions: [],
};

/** Campos disponíveis para condições e variáveis de mensagem. */
export const CONTEXT_FIELDS = [
  "lead.title", "lead.value", "lead.source", "lead.priority", "lead.stage_id", "lead.owner_id",
  "contact.name", "contact.phone", "contact.city",
  "vehicle.brand", "vehicle.model", "vehicle.price", "vehicle.status", "vehicle.year_model",
] as const;

export type AutomationRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  trigger_type: string | null;
  draft_definition: AutomationDefinition | null;
  published_version: number | null;
  created_at: string;
  updated_at: string;
};
