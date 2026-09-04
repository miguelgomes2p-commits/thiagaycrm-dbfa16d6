// Tipos client-safe do módulo Fiscal. Nenhum segredo aqui.

export type FiscalEnvironment = "homologation" | "production";
export type FiscalDocumentType = "NFE" | "NFCE" | "NFSE" | "CTE" | "MDFE";

export type FiscalDocumentStatus =
  | "draft"
  | "pending"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancelled"
  | "error";

export const FISCAL_STATUS_LABEL: Record<FiscalDocumentStatus, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  processing: "Processando",
  authorized: "Autorizada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  error: "Erro",
};

export type FiscalConfigStatus =
  | "not_configured"
  | "incomplete"
  | "homologation"
  | "production_ready";

export const FISCAL_CONFIG_STATUS_LABEL: Record<FiscalConfigStatus, string> = {
  not_configured: "Não configurado",
  incomplete: "Configuração incompleta",
  homologation: "Homologação",
  production_ready: "Pronto para produção",
};

export type FiscalPermission =
  | "fiscal.view"
  | "fiscal.issue"
  | "fiscal.cancel"
  | "fiscal.configure"
  | "fiscal.download";

/** owner/admin têm tudo; manager visualiza e baixa; agent apenas visualiza os próprios. */
export function fiscalPermissionsForRole(role: string | undefined): FiscalPermission[] {
  if (role === "owner" || role === "admin" || role === "support")
    return ["fiscal.view", "fiscal.issue", "fiscal.cancel", "fiscal.configure", "fiscal.download"];
  if (role === "manager") return ["fiscal.view", "fiscal.download"];
  return ["fiscal.view"];
}

export const REGIME_TRIBUTARIO_OPTIONS = [
  { value: 1, label: "Simples Nacional" },
  { value: 2, label: "Simples Nacional — excesso de sublimite" },
  { value: 3, label: "Regime Normal" },
  { value: 4, label: "MEI / Simples Nacional — MEI" },
] as const;

export const OPERATION_TYPE_OPTIONS = [
  { value: "venda_veiculo_usado_interna", label: "Venda de veículo usado — dentro do estado" },
  { value: "venda_veiculo_usado_interestadual", label: "Venda de veículo usado — interestadual" },
  { value: "venda_veiculo_novo", label: "Venda de veículo novo" },
  { value: "outra", label: "Outra operação" },
] as const;

/** Itens do checklist do contador — apenas coleta, nunca sugestão automática. */
export const ACCOUNTANT_CHECKLIST_ITEMS = [
  { key: "cfop", label: "CFOP das operações de venda" },
  { key: "ncm", label: "NCM do veículo" },
  { key: "cst_csosn", label: "CST / CSOSN de ICMS" },
  { key: "icms", label: "Tratamento de ICMS (base, redução, benefícios)" },
  { key: "pis_cofins", label: "CST de PIS/COFINS" },
  { key: "ipi", label: "IPI, quando aplicável" },
  { key: "reforma", label: "Campos da Reforma Tributária (IBS/CBS)" },
  { key: "credenciamento", label: "Credenciamento na SEFAZ para NF-e" },
] as const;

export type FiscalValidationIssue = { field: string; message: string };

/**
 * Status do certificado A1 que permitem TENTAR emissão.
 * - configured: verificado (upload pelo CRM ou consulta à API da Focus).
 * - external_declared: o administrador informou que o certificado está sob
 *   custódia da Focus (cadastrado no painel). A Focus é a autoridade final.
 */
export const CERTIFICATE_ISSUE_STATUSES = ["configured", "external_declared"] as const;

export function certificateAllowsIssue(status: string | null | undefined): boolean {
  return (CERTIFICATE_ISSUE_STATUSES as readonly string[]).includes(status ?? "");
}


export type FiscalConfigView = {
  exists: boolean;
  provider: string;
  environment: FiscalEnvironment;
  production_enabled: boolean;
  status: FiscalConfigStatus;
  missing: FiscalValidationIssue[];
  certificate_status: string;
  certificate_expires_at: string | null;
  certificate_filename: string | null;
  provider_company_id: string | null;
  has_token_homolog: boolean;
  has_token_prod: boolean;
  accountant_checklist: Record<string, boolean>;
  emitter: {
    cnpj_emitente: string | null;
    ie_emitente: string | null;
    regime_tributario: number | null;
    serie_padrao: number | null;
    emit_razao_social: string | null;
    emit_nome_fantasia: string | null;
    emit_telefone: string | null;
    emit_email: string | null;
    emit_cep: string | null;
    emit_logradouro: string | null;
    emit_numero: string | null;
    emit_complemento: string | null;
    emit_bairro: string | null;
    emit_municipio: string | null;
    emit_ibge: string | null;
    emit_uf: string | null;
  };
};

export type FiscalOnboardingStep = {
  key: string;
  label: string;
  done: boolean;
};
