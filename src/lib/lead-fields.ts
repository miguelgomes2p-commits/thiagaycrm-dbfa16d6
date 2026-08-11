/**
 * Field Registry — motor de campos dinâmicos do Lead.
 *
 * Valores continuam persistidos em `leads.custom_fields` (JSONB já existente),
 * mantendo compatibilidade total com leads antigos, N8N, IA e automações:
 * a chave do JSON é sempre o `field_key` imutável.
 */

export type LeadFieldType =
  | "TEXT" | "TEXTAREA"
  | "INTEGER" | "DECIMAL" | "CURRENCY" | "PERCENTAGE"
  | "BOOLEAN" | "CHECKBOX"
  | "SINGLE_SELECT" | "MULTI_SELECT" | "RADIO"
  | "DATE" | "DATETIME" | "TIME"
  | "PHONE" | "EMAIL" | "URL"
  | "CPF" | "CNPJ" | "CPF_CNPJ" | "CEP" | "ADDRESS"
  | "FILE" | "IMAGE" | "USER" | "CUSTOM_MASK";

export const FIELD_TYPE_LABELS: Record<LeadFieldType, string> = {
  TEXT: "Texto curto",
  TEXTAREA: "Texto longo",
  INTEGER: "Número inteiro",
  DECIMAL: "Número decimal",
  CURRENCY: "Moeda (R$)",
  PERCENTAGE: "Percentual",
  BOOLEAN: "Sim / Não",
  CHECKBOX: "Caixa de seleção",
  SINGLE_SELECT: "Lista (única)",
  MULTI_SELECT: "Lista (múltipla)",
  RADIO: "Opções (radio)",
  DATE: "Data",
  DATETIME: "Data e hora",
  TIME: "Hora",
  PHONE: "Telefone",
  EMAIL: "E-mail",
  URL: "Link",
  CPF: "CPF",
  CNPJ: "CNPJ",
  CPF_CNPJ: "CPF ou CNPJ",
  CEP: "CEP",
  ADDRESS: "Endereço",
  FILE: "Arquivo (link)",
  IMAGE: "Imagem (link)",
  USER: "Usuário do CRM",
  CUSTOM_MASK: "Texto com máscara",
};

export const FIELD_CONTEXTS = [
  "CREATE_FROM_CONVERSATION",
  "CREATE_FROM_PIPELINE",
  "LEAD_DETAIL",
  "PIPELINE_CARD",
  "LEAD_PREVIEW",
] as const;
export type FieldContext = (typeof FIELD_CONTEXTS)[number];

export const CONTEXT_LABELS: Record<FieldContext, string> = {
  CREATE_FROM_CONVERSATION: "Cadastro pela conversa",
  CREATE_FROM_PIPELINE: "Cadastro pela pipeline",
  LEAD_DETAIL: "Detalhes do lead",
  PIPELINE_CARD: "Card da pipeline",
  LEAD_PREVIEW: "Preview rápido",
};

export type FieldOption = { id: string; label: string };

export type ConditionalOperator =
  | "equals" | "not_equals" | "contains" | "has_value" | "is_empty"
  | "greater_than" | "less_than";

export type ConditionalRule = {
  field_key: string;
  operator: ConditionalOperator;
  value?: string;
  /** quando a regra é satisfeita, o campo também vira obrigatório */
  makes_required?: boolean;
};

export type LeadFieldDefinition = {
  id: string;
  workspace_id: string;
  entity_type: string;
  field_key: string;
  label: string;
  field_type: LeadFieldType;
  group_id: string | null;
  placeholder: string | null;
  help_text: string | null;
  default_value: string | null;
  options: FieldOption[];
  validation: Record<string, unknown>;
  display_config: Partial<Record<FieldContext, boolean>>;
  pipeline_ids: string[];
  required_stage_ids: string[];
  conditional_rules: ConditionalRule[];
  is_required: boolean;
  is_system: boolean;
  is_active: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  sort_order: number;
};

export type LeadFieldGroup = {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type LeadFieldValues = Record<string, string>;

/* ------------------------------------------------------------------ */
/* Chave interna                                                       */
/* ------------------------------------------------------------------ */

export function slugifyKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "campo";
}

/* ------------------------------------------------------------------ */
/* Máscaras / formatação de exibição                                   */
/* ------------------------------------------------------------------ */

const digits = (v: string) => (v ?? "").replace(/\D/g, "");

export function maskCpf(v: string) {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function maskCnpj(v: string) {
  const d = digits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskCep(v: string) {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskPhoneBr(v: string) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function applyCustomMask(value: string, mask: string) {
  const raw = value.replace(/[^0-9a-zA-Z]/g, "");
  let out = "";
  let i = 0;
  for (const ch of mask) {
    if (i >= raw.length) break;
    if (ch === "9") { if (/\d/.test(raw[i]!)) { out += raw[i]; i++; } else { i++; } }
    else if (ch === "A") { out += raw[i]!.toUpperCase(); i++; }
    else if (ch === "*") { out += raw[i]; i++; }
    else out += ch;
  }
  return out;
}

export function formatCurrencyBRL(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

/** Formata o valor canônico armazenado para exibição amigável. */
export function formatFieldValue(def: LeadFieldDefinition, raw: string | undefined | null): string {
  const value = (raw ?? "").toString();
  if (!value) return "";
  switch (def.field_type) {
    case "CURRENCY": {
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      return formatCurrencyBRL(n, String((def.validation as { currency?: string }).currency ?? "BRL"));
    }
    case "PERCENTAGE": {
      const n = Number(value);
      return Number.isFinite(n) ? `${n.toLocaleString("pt-BR")}%` : value;
    }
    case "DECIMAL": {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString("pt-BR") : value;
    }
    case "CPF": return maskCpf(value);
    case "CNPJ": return maskCnpj(value);
    case "CPF_CNPJ": return digits(value).length > 11 ? maskCnpj(value) : maskCpf(value);
    case "CEP": return maskCep(value);
    case "PHONE": return maskPhoneBr(value);
    case "BOOLEAN":
    case "CHECKBOX": return value === "true" ? "Sim" : "Não";
    case "DATE": {
      const d = new Date(`${value}T00:00:00`);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
    }
    case "DATETIME": {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
    }
    case "SINGLE_SELECT":
    case "RADIO":
      return def.options.find((o) => o.id === value)?.label ?? value;
    case "MULTI_SELECT":
      return value
        .split(",")
        .filter(Boolean)
        .map((id) => def.options.find((o) => o.id === id)?.label ?? id)
        .join(", ");
    default:
      return value;
  }
}

/* ------------------------------------------------------------------ */
/* Validação (usada no frontend E no backend)                          */
/* ------------------------------------------------------------------ */

export function isValidCpf(input: string) {
  const cpf = digits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function isValidCnpj(input: string) {
  const cnpj = digits(input);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    let pos = len - 7;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(cnpj[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** Retorna mensagem de erro ou null. Não valida obrigatoriedade (ver validateLeadFields). */
export function validateFieldValue(def: LeadFieldDefinition, raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  switch (def.field_type) {
    case "INTEGER":
      if (!/^-?\d+$/.test(value)) return "Informe um número inteiro.";
      break;
    case "DECIMAL":
    case "CURRENCY":
    case "PERCENTAGE":
      if (!Number.isFinite(Number(value))) return "Informe um número válido.";
      break;
    case "EMAIL":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "E-mail inválido.";
      break;
    case "URL":
      if (!/^https?:\/\/.+/i.test(value)) return "Informe um link começando com http(s)://";
      break;
    case "CPF":
      if (!isValidCpf(value)) return "CPF inválido.";
      break;
    case "CNPJ":
      if (!isValidCnpj(value)) return "CNPJ inválido.";
      break;
    case "CPF_CNPJ": {
      const d = digits(value);
      if (d.length === 11 ? !isValidCpf(d) : d.length === 14 ? !isValidCnpj(d) : true) {
        return "CPF/CNPJ inválido.";
      }
      break;
    }
    case "CEP":
      if (digits(value).length !== 8) return "CEP deve ter 8 dígitos.";
      break;
    case "PHONE":
      if (digits(value).length < 10) return "Telefone incompleto.";
      break;
    default:
      break;
  }
  const v = def.validation as { min_length?: number; max_length?: number; min?: number; max?: number };
  if (v.min_length && value.length < v.min_length) return `Mínimo de ${v.min_length} caracteres.`;
  if (v.max_length && value.length > v.max_length) return `Máximo de ${v.max_length} caracteres.`;
  const num = Number(value);
  if (Number.isFinite(num)) {
    if (typeof v.min === "number" && num < v.min) return `Valor mínimo: ${v.min}.`;
    if (typeof v.max === "number" && num > v.max) return `Valor máximo: ${v.max}.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Regras condicionais e visibilidade                                  */
/* ------------------------------------------------------------------ */

function ruleMatches(rule: ConditionalRule, values: LeadFieldValues): boolean {
  const current = (values[rule.field_key] ?? "").toString();
  const target = (rule.value ?? "").toString();
  switch (rule.operator) {
    case "equals": return current === target;
    case "not_equals": return current !== target;
    case "contains": return current.toLowerCase().includes(target.toLowerCase());
    case "has_value": return current.trim().length > 0;
    case "is_empty": return current.trim().length === 0;
    case "greater_than": return Number(current) > Number(target);
    case "less_than": return Number(current) < Number(target);
    default: return true;
  }
}

export function isFieldVisible(
  def: LeadFieldDefinition,
  opts: { context: FieldContext; pipelineId?: string | null; values: LeadFieldValues },
): boolean {
  if (!def.is_active) return false;
  if (def.display_config[opts.context] !== true) return false;
  if (def.pipeline_ids.length > 0 && opts.pipelineId && !def.pipeline_ids.includes(opts.pipelineId)) return false;
  if (def.conditional_rules.length === 0) return true;
  // Todas as regras precisam ser satisfeitas (AND) — V1.
  return def.conditional_rules.every((r) => ruleMatches(r, opts.values));
}

export function isFieldRequired(
  def: LeadFieldDefinition,
  opts: { values: LeadFieldValues; stageId?: string | null },
): boolean {
  if (def.is_required) return true;
  if (opts.stageId && def.required_stage_ids.includes(opts.stageId)) return true;
  return def.conditional_rules.some((r) => r.makes_required && ruleMatches(r, opts.values));
}

/** Valida um conjunto completo. Retorna mapa field_key -> erro. */
export function validateLeadFields(
  defs: LeadFieldDefinition[],
  values: LeadFieldValues,
  opts: { context: FieldContext; pipelineId?: string | null; stageId?: string | null },
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of defs) {
    if (!isFieldVisible(def, { context: opts.context, pipelineId: opts.pipelineId ?? null, values })) continue;
    const value = (values[def.field_key] ?? "").toString().trim();
    if (!value) {
      if (isFieldRequired(def, { values, stageId: opts.stageId ?? null })) {
        errors[def.field_key] = `${def.label} é obrigatório.`;
      }
      continue;
    }
    const err = validateFieldValue(def, value);
    if (err) errors[def.field_key] = err;
  }
  return errors;
}

/** Normaliza o valor digitado para a forma canônica persistida. */
export function toCanonicalValue(def: LeadFieldDefinition, input: string): string {
  const value = (input ?? "").toString();
  switch (def.field_type) {
    case "CPF":
    case "CNPJ":
    case "CPF_CNPJ":
    case "CEP":
    case "PHONE":
      return digits(value);
    case "CURRENCY":
    case "DECIMAL":
    case "PERCENTAGE": {
      const normalized = value.replace(/[R$\s.]/g, "").replace(",", ".");
      return normalized === "" ? "" : String(Number(normalized));
    }
    case "INTEGER":
      return digits(value);
    default:
      return value.trim();
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export type FieldTemplateItem = {
  field_key: string;
  label: string;
  field_type: LeadFieldType;
  group: string;
  options?: FieldOption[];
  display_config?: Partial<Record<FieldContext, boolean>>;
};

export const FIELD_TEMPLATES: Record<string, { name: string; description: string; groups: string[]; fields: FieldTemplateItem[] }> = {
  automotivo: {
    name: "Automotivo",
    description: "Campos usados por concessionárias e revendas de veículos.",
    groups: ["Comercial", "Financiamento", "Veículo na troca", "Documentação", "Origem / Marketing"],
    fields: [
      { field_key: "veiculo_interesse", label: "Veículo de interesse", field_type: "TEXT", group: "Comercial", display_config: { CREATE_FROM_CONVERSATION: true, CREATE_FROM_PIPELINE: true, LEAD_DETAIL: true, PIPELINE_CARD: true } },
      { field_key: "categoria_veiculo", label: "Categoria", field_type: "SINGLE_SELECT", group: "Comercial", options: [
        { id: "hatch", label: "Hatch" }, { id: "sedan", label: "Sedã" }, { id: "suv", label: "SUV" }, { id: "picape", label: "Picape" },
      ] },
      { field_key: "objetivo", label: "Objetivo", field_type: "SINGLE_SELECT", group: "Comercial", options: [
        { id: "financiamento", label: "Financiamento" }, { id: "a_vista", label: "À vista" },
        { id: "consorcio", label: "Consórcio" }, { id: "troca", label: "Veículo na troca" },
      ] },
      { field_key: "valor_negociacao", label: "Valor da negociação", field_type: "CURRENCY", group: "Comercial", display_config: { CREATE_FROM_PIPELINE: true, LEAD_DETAIL: true, PIPELINE_CARD: true } },
      { field_key: "financiamento_entrada", label: "Valor de entrada", field_type: "CURRENCY", group: "Financiamento" },
      { field_key: "forma_pagamento", label: "Forma de pagamento", field_type: "SINGLE_SELECT", group: "Financiamento", options: [
        { id: "a_vista", label: "À vista" }, { id: "financiamento", label: "Financiamento" },
        { id: "consorcio", label: "Consórcio" }, { id: "cartao", label: "Cartão" },
      ] },
      { field_key: "possui_troca", label: "Possui veículo na troca", field_type: "BOOLEAN", group: "Veículo na troca" },
      { field_key: "modelo_usado", label: "Modelo do usado", field_type: "TEXT", group: "Veículo na troca" },
      { field_key: "ano_usado", label: "Ano do usado", field_type: "INTEGER", group: "Veículo na troca" },
      { field_key: "km_usado", label: "KM do usado", field_type: "INTEGER", group: "Veículo na troca" },
      { field_key: "cpf", label: "CPF", field_type: "CPF", group: "Documentação" },
      { field_key: "data_nascimento", label: "Data de nascimento", field_type: "DATE", group: "Documentação" },
      { field_key: "urgencia", label: "Urgência", field_type: "SINGLE_SELECT", group: "Origem / Marketing", options: [
        { id: "esta_semana", label: "Esta semana" }, { id: "este_mes", label: "Este mês" }, { id: "sem_pressa", label: "Sem pressa" },
      ] },
      { field_key: "origem_lead", label: "Origem", field_type: "TEXT", group: "Origem / Marketing", display_config: { CREATE_FROM_CONVERSATION: true, CREATE_FROM_PIPELINE: true, LEAD_DETAIL: true, PIPELINE_CARD: true } },
    ],
  },
  qualificacao_legada: {
    name: "Qualificação (campos atuais)",
    description: "Recria como campos configuráveis os 14 campos de qualificação já usados hoje no CRM. Mantém as mesmas chaves, então os leads existentes continuam exibindo seus valores.",
    groups: ["Qualificação"],
    fields: [
      { field_key: "origem", label: "Origem", field_type: "TEXT", group: "Qualificação" },
      { field_key: "canal", label: "Canal", field_type: "SINGLE_SELECT", group: "Qualificação", options: [
        { id: "whatsapp", label: "whatsapp" }, { id: "instagram", label: "instagram" }, { id: "facebook", label: "facebook" },
        { id: "telefone", label: "telefone" }, { id: "presencial", label: "presencial" }, { id: "site", label: "site" },
      ] },
      { field_key: "classificacao", label: "Classificação", field_type: "SINGLE_SELECT", group: "Qualificação", options: [
        { id: "quente", label: "quente" }, { id: "morno", label: "morno" }, { id: "frio", label: "frio" },
      ] },
      { field_key: "campanha", label: "Campanha / Criativo", field_type: "TEXT", group: "Qualificação" },
      { field_key: "interesse", label: "Interesse", field_type: "TEXT", group: "Qualificação" },
      { field_key: "categoria", label: "Categoria", field_type: "TEXT", group: "Qualificação" },
      { field_key: "forma_pagamento", label: "Forma de pagamento", field_type: "SINGLE_SELECT", group: "Qualificação", options: [
        { id: "à vista", label: "à vista" }, { id: "financiamento", label: "financiamento" },
        { id: "consórcio", label: "consórcio" }, { id: "cartão", label: "cartão" }, { id: "outro", label: "outro" },
      ] },
      { field_key: "entrada", label: "Entrada", field_type: "TEXT", group: "Qualificação" },
      { field_key: "troca", label: "Troca", field_type: "SINGLE_SELECT", group: "Qualificação", options: [{ id: "sim", label: "sim" }, { id: "não", label: "não" }] },
      { field_key: "veiculo_troca", label: "Veículo na troca", field_type: "TEXT", group: "Qualificação" },
      { field_key: "cnh", label: "CNH", field_type: "SINGLE_SELECT", group: "Qualificação", options: [{ id: "sim", label: "sim" }, { id: "não", label: "não" }] },
      { field_key: "nome_limpo", label: "Nome limpo", field_type: "SINGLE_SELECT", group: "Qualificação", options: [{ id: "sim", label: "sim" }, { id: "não", label: "não" }] },
      { field_key: "urgencia", label: "Urgência", field_type: "TEXT", group: "Qualificação" },
      { field_key: "ultima_mensagem", label: "Última mensagem", field_type: "TEXTAREA", group: "Qualificação" },
    ],
  },
};

export const DEFAULT_DISPLAY_CONFIG: Record<FieldContext, boolean> = {
  CREATE_FROM_CONVERSATION: true,
  CREATE_FROM_PIPELINE: true,
  LEAD_DETAIL: true,
  PIPELINE_CARD: false,
  LEAD_PREVIEW: false,
};
