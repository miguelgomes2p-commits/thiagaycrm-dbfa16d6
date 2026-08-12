// FiscalService — toda montagem/validação fiscal passa por aqui.
// SERVER-ONLY: importe apenas dentro de handlers (dynamic import).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createFiscalProvider, mapFocusStatus, type FiscalProvider } from "./provider.server";
import type { FiscalConfigStatus, FiscalEnvironment, FiscalValidationIssue } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;

export type FiscalConfigRow = Record<string, any>;

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

export async function loadConfig(admin: Admin, workspaceId: string): Promise<FiscalConfigRow | null> {
  const { data, error } = await admin
    .from("nfe_config")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Campos obrigatórios do emitente para qualquer emissão. */
export function missingEmitterFields(cfg: FiscalConfigRow | null): FiscalValidationIssue[] {
  const out: FiscalValidationIssue[] = [];
  if (!cfg) return [{ field: "config", message: "Configuração fiscal não iniciada." }];
  const req: Array<[string, string]> = [
    ["emit_razao_social", "Razão social do emitente"],
    ["cnpj_emitente", "CNPJ do emitente"],
    ["ie_emitente", "Inscrição Estadual do emitente"],
    ["emit_cep", "CEP do emitente"],
    ["emit_logradouro", "Logradouro do emitente"],
    ["emit_numero", "Número do endereço do emitente"],
    ["emit_bairro", "Bairro do emitente"],
    ["emit_municipio", "Município do emitente"],
    ["emit_ibge", "Código IBGE do município do emitente"],
    ["emit_uf", "UF do emitente"],
  ];
  for (const [k, label] of req) if (!cfg[k]) out.push({ field: k, message: `${label} ausente` });
  if (!cfg.regime_tributario) out.push({ field: "regime_tributario", message: "Regime tributário não definido" });
  if (!cfg.serie_padrao) out.push({ field: "serie_padrao", message: "Série da NF-e não definida" });
  return out;
}

export function configEnvironment(cfg: FiscalConfigRow | null): FiscalEnvironment {
  return cfg?.environment === "producao" || cfg?.environment === "production"
    ? "production"
    : "homologation";
}

export function computeConfigStatus(
  cfg: FiscalConfigRow | null,
  hasProfile: boolean,
): { status: FiscalConfigStatus; missing: FiscalValidationIssue[] } {
  if (!cfg) return { status: "not_configured", missing: missingEmitterFields(null) };
  const missing = missingEmitterFields(cfg);
  if (cfg.certificate_status !== "configured")
    missing.push({ field: "certificate", message: "Certificado digital A1 não configurado" });
  if (!cfg.token_homolog_enc && !cfg.token_prod_enc)
    missing.push({ field: "provider", message: "Credenciais do provedor fiscal não configuradas" });
  if (!hasProfile)
    missing.push({ field: "fiscal_profile", message: "Nenhum perfil fiscal cadastrado" });

  if (missing.length > 0) {
    const anythingSet = !!(cfg.cnpj_emitente || cfg.emit_razao_social || cfg.token_homolog_enc);
    return { status: anythingSet ? "incomplete" : "not_configured", missing };
  }
  if (configEnvironment(cfg) === "production" && cfg.production_enabled)
    return { status: "production_ready", missing };
  return { status: "homologation", missing };
}

export async function getProviderForWorkspace(
  admin: Admin,
  workspaceId: string,
): Promise<{ provider: FiscalProvider; cfg: FiscalConfigRow; environment: FiscalEnvironment }> {
  const cfg = await loadConfig(admin, workspaceId);
  if (!cfg) throw new Error("Configuração fiscal não encontrada.");
  const environment = configEnvironment(cfg);
  if (environment === "production" && !cfg.production_enabled)
    throw new Error("Emissão em produção não habilitada para este workspace.");
  const { decryptSecret } = await import("../renave.server");
  const enc = environment === "production" ? cfg.token_prod_enc : cfg.token_homolog_enc;
  if (!enc) throw new Error(`Credencial do provedor fiscal (${environment}) não configurada.`);
  const provider = createFiscalProvider({
    provider: cfg.provider ?? "focus_nfe",
    environment,
    token: decryptSecret(enc),
  });
  return { provider, cfg, environment };
}

/* ------------------------- snapshots + payload ------------------------- */

export type RecipientInput = {
  person_type: "PF" | "PJ";
  name: string;
  cpf?: string;
  cnpj?: string;
  ie?: string;
  email?: string;
  phone?: string;
  zipcode: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  ibge: string;
  uf: string;
  final_consumer?: boolean;
  taxpayer?: boolean;
};

export function validateRecipient(r: Partial<RecipientInput>): FiscalValidationIssue[] {
  const out: FiscalValidationIssue[] = [];
  if (!r.name) out.push({ field: "name", message: "Nome/Razão social do comprador ausente" });
  if (r.person_type === "PJ") {
    if (onlyDigits(r.cnpj).length !== 14) out.push({ field: "cnpj", message: "CNPJ do comprador inválido ou ausente" });
  } else if (onlyDigits(r.cpf).length !== 11) {
    out.push({ field: "cpf", message: "CPF do comprador inválido ou ausente" });
  }
  const req: Array<[keyof RecipientInput, string]> = [
    ["zipcode", "CEP do comprador"],
    ["street", "Logradouro do comprador"],
    ["number", "Número do endereço do comprador"],
    ["district", "Bairro do comprador"],
    ["city", "Município do comprador"],
    ["ibge", "Código IBGE do município do comprador"],
    ["uf", "UF do comprador"],
  ];
  for (const [k, label] of req) if (!r[k]) out.push({ field: k, message: `${label} ausente` });
  return out;
}

export function validateProfile(profile: Record<string, any> | null): FiscalValidationIssue[] {
  if (!profile) return [{ field: "fiscal_profile", message: "Perfil fiscal não definido para a operação" }];
  const out: FiscalValidationIssue[] = [];
  if (!profile.cfop) out.push({ field: "cfop", message: "CFOP não definido no perfil fiscal" });
  if (!profile.ncm) out.push({ field: "ncm", message: "NCM não definido no perfil fiscal" });
  const tax = (profile.tax_configuration ?? {}) as Record<string, any>;
  if (!tax.icms_situacao_tributaria && !tax.icms_csosn)
    out.push({ field: "icms", message: "CST/CSOSN de ICMS não definido no perfil fiscal" });
  if (!tax.pis_situacao_tributaria)
    out.push({ field: "pis", message: "CST de PIS não definido no perfil fiscal" });
  if (!tax.cofins_situacao_tributaria)
    out.push({ field: "cofins", message: "CST de COFINS não definido no perfil fiscal" });
  return out;
}

export function buildIssuerSnapshot(cfg: FiscalConfigRow) {
  return {
    razao_social: cfg.emit_razao_social,
    nome_fantasia: cfg.emit_nome_fantasia,
    cnpj: onlyDigits(cfg.cnpj_emitente),
    ie: cfg.ie_emitente,
    regime_tributario: cfg.regime_tributario,
    telefone: cfg.emit_telefone,
    email: cfg.emit_email,
    endereco: {
      cep: onlyDigits(cfg.emit_cep),
      logradouro: cfg.emit_logradouro,
      numero: cfg.emit_numero,
      complemento: cfg.emit_complemento,
      bairro: cfg.emit_bairro,
      municipio: cfg.emit_municipio,
      ibge: cfg.emit_ibge,
      uf: cfg.emit_uf,
    },
  };
}

export function vehicleDescription(v: Record<string, any>): string {
  return [v.brand, v.model, v.version, v.year_model ? `${v.year_manufacture ?? ""}/${v.year_model}` : null, v.color]
    .filter(Boolean)
    .join(" ");
}

export function vehicleAdditionalInfo(v: Record<string, any>): string {
  const parts: string[] = [];
  if (v.chassis) parts.push(`Chassi: ${v.chassis}`);
  if (v.renavam) parts.push(`RENAVAM: ${v.renavam}`);
  if (v.plate) parts.push(`Placa: ${v.plate}`);
  if (v.mileage != null) parts.push(`KM: ${v.mileage}`);
  if (v.fuel) parts.push(`Combustível: ${v.fuel}`);
  return parts.join(" | ");
}

/** Monta o payload NF-e modelo 55 usando EXCLUSIVAMENTE os valores do perfil fiscal. */
export function buildNfePayload(input: {
  cfg: FiscalConfigRow;
  profile: Record<string, any>;
  vehicle: Record<string, any>;
  recipient: RecipientInput;
  amount: number;
}) {
  const { cfg, profile, vehicle, recipient, amount } = input;
  const tax = (profile.tax_configuration ?? {}) as Record<string, any>;
  const value = amount.toFixed(2);

  const item: Record<string, unknown> = {
    numero_item: 1,
    codigo_produto: vehicle.stock_code || vehicle.chassis?.slice(-10) || "VEIC001",
    descricao: vehicleDescription(vehicle) || "Veículo automotor",
    codigo_ncm: profile.ncm,
    cfop: profile.cfop,
    unidade_comercial: "UN",
    quantidade_comercial: "1.0000",
    valor_unitario_comercial: value,
    valor_bruto: value,
    unidade_tributavel: "UN",
    quantidade_tributavel: "1.0000",
    valor_unitario_tributavel: value,
    icms_origem: profile.product_origin ?? "0",
    informacoes_adicionais_item: vehicleAdditionalInfo(vehicle),
    ...(profile.cest ? { cest: profile.cest } : {}),
    ...tax, // CST/CSOSN, alíquotas e reduções vindos da contabilidade
  };

  const destinatario =
    recipient.person_type === "PJ"
      ? {
          cnpj_destinatario: onlyDigits(recipient.cnpj),
          inscricao_estadual_destinatario: recipient.ie || "ISENTO",
          indicador_inscricao_estadual_destinatario: recipient.taxpayer ? 1 : 9,
        }
      : {
          cpf_destinatario: onlyDigits(recipient.cpf),
          indicador_inscricao_estadual_destinatario: 9,
        };

  return {
    natureza_operacao: profile.natureza_operacao ?? "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    consumidor_final: recipient.final_consumer === false ? 0 : 1,
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: recipient.uf === cfg.emit_uf ? 1 : 2,
    serie: cfg.serie_padrao ?? 1,
    cnpj_emitente: onlyDigits(cfg.cnpj_emitente),
    inscricao_estadual_emitente: cfg.ie_emitente,
    nome_emitente: cfg.emit_razao_social,
    nome_fantasia_emitente: cfg.emit_nome_fantasia,
    logradouro_emitente: cfg.emit_logradouro,
    numero_emitente: cfg.emit_numero,
    complemento_emitente: cfg.emit_complemento ?? undefined,
    bairro_emitente: cfg.emit_bairro,
    municipio_emitente: cfg.emit_municipio,
    codigo_municipio_emitente: cfg.emit_ibge,
    uf_emitente: cfg.emit_uf,
    cep_emitente: onlyDigits(cfg.emit_cep),
    telefone_emitente: onlyDigits(cfg.emit_telefone),
    regime_tributario_emitente: cfg.regime_tributario,
    nome_destinatario: recipient.name,
    ...destinatario,
    email_destinatario: recipient.email || undefined,
    telefone_destinatario: onlyDigits(recipient.phone),
    logradouro_destinatario: recipient.street,
    numero_destinatario: recipient.number,
    complemento_destinatario: recipient.complement || undefined,
    bairro_destinatario: recipient.district,
    municipio_destinatario: recipient.city,
    codigo_municipio_destinatario: recipient.ibge,
    uf_destinatario: recipient.uf,
    cep_destinatario: onlyDigits(recipient.zipcode),
    items: [item],
    valor_produtos: value,
    valor_total: value,
    informacoes_adicionais_contribuinte: [profile.additional_information, vehicleAdditionalInfo(vehicle)]
      .filter(Boolean)
      .join(" | "),
  };
}

/* ------------------------- persistência auxiliar ------------------------- */

export async function recordAttempt(
  admin: Admin,
  input: {
    workspaceId: string;
    documentId: string | null;
    provider: string;
    action: string;
    status: string;
    httpStatus?: number;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  await admin.from("fiscal_emission_attempts").insert({
    workspace_id: input.workspaceId,
    document_id: input.documentId,
    provider: input.provider,
    action: input.action,
    status: input.status,
    http_status: input.httpStatus ?? null,
    error_code: input.errorCode ?? null,
    // nunca registrar token/senha/certificado
    error_message: input.errorMessage ? input.errorMessage.slice(0, 1000) : null,
  } as any);
}

/** Baixa XML/DANFE do provider e guarda no Storage privado do workspace. */
export async function archiveDocumentFiles(
  admin: Admin,
  provider: FiscalProvider,
  doc: { id: string; workspace_id: string; xml_storage_path: string | null; danfe_storage_path: string | null },
  urls: { xmlUrl?: string; danfeUrl?: string },
): Promise<{ xml_storage_path?: string; danfe_storage_path?: string }> {
  const out: { xml_storage_path?: string; danfe_storage_path?: string } = {};
  if (urls.xmlUrl && !doc.xml_storage_path) {
    const file = await provider.downloadFile(urls.xmlUrl);
    if (file.ok && file.bytes) {
      const path = `${doc.workspace_id}/${doc.id}.xml`;
      const { error } = await admin.storage
        .from("fiscal-docs")
        .upload(path, new Uint8Array(file.bytes), { contentType: "application/xml", upsert: false });
      if (!error) out.xml_storage_path = path;
    }
  }
  if (urls.danfeUrl && !doc.danfe_storage_path) {
    const file = await provider.downloadFile(urls.danfeUrl);
    if (file.ok && file.bytes) {
      const path = `${doc.workspace_id}/${doc.id}.pdf`;
      const { error } = await admin.storage
        .from("fiscal-docs")
        .upload(path, new Uint8Array(file.bytes), { contentType: "application/pdf", upsert: false });
      if (!error) out.danfe_storage_path = path;
    }
  }
  return out;
}

/** Aplica o retorno do provider ao documento e dispara timeline/notificações. */
export async function applyProviderResult(
  admin: Admin,
  provider: FiscalProvider,
  documentId: string,
  result: {
    ok: boolean;
    httpStatus: number;
    status?: string;
    errorCode?: string;
    errorMessage?: string;
    number?: string;
    series?: string;
    accessKey?: string;
    protocol?: string;
    xmlUrl?: string;
    danfeUrl?: string;
  },
) {
  const { data: doc } = await admin.from("fiscal_documents").select("*").eq("id", documentId).maybeSingle();
  if (!doc) return null;

  const internal = result.ok ? mapFocusStatus(result.status) : result.status ? mapFocusStatus(result.status) : "error";
  const patch: Record<string, any> = { status: internal };
  if (result.number) patch.number = result.number;
  if (result.series) patch.series = result.series;
  if (result.accessKey) patch.access_key = result.accessKey;
  if (result.protocol) patch.protocol = result.protocol;
  if (result.xmlUrl) patch.xml_url = result.xmlUrl;
  if (result.danfeUrl) patch.danfe_url = result.danfeUrl;

  if (internal === "authorized") {
    patch.authorized_at = doc.authorized_at ?? new Date().toISOString();
    patch.rejection_code = null;
    patch.rejection_message = null;
    const paths = await archiveDocumentFiles(admin, provider, doc, {
      ...(result.xmlUrl ? { xmlUrl: result.xmlUrl } : {}),
      ...(result.danfeUrl ? { danfeUrl: result.danfeUrl } : {}),
    });
    Object.assign(patch, paths);
  }
  if (internal === "rejected" || internal === "error") {
    patch.rejection_code = result.errorCode ?? null;
    patch.rejection_message = result.errorMessage ?? "Falha na comunicação com a SEFAZ.";
  }
  if (internal === "cancelled") patch.cancelled_at = doc.cancelled_at ?? new Date().toISOString();

  await admin.from("fiscal_documents").update(patch).eq("id", documentId);

  if (doc.status !== internal) {
    await emitFiscalEvent(admin, { ...doc, ...patch }, internal);
  }
  return { ...doc, ...patch };
}

/** Timeline + notificações + evento de domínio para o Automation Studio. */
export async function emitFiscalEvent(admin: Admin, doc: Record<string, any>, status: string) {
  const eventType =
    status === "authorized"
      ? "fiscal.nfe_authorized"
      : status === "rejected" || status === "error"
        ? "fiscal.nfe_rejected"
        : status === "cancelled"
          ? "fiscal.nfe_cancelled"
          : "fiscal.nfe_requested";

  await admin.from("crm_events").insert({
    workspace_id: doc.workspace_id,
    event_type: eventType,
    entity_type: "fiscal_document",
    entity_id: doc.id,
    payload: {
      status,
      number: doc.number ?? null,
      access_key: doc.access_key ?? null,
      vehicle_id: doc.vehicle_id ?? null,
      lead_id: doc.lead_id ?? null,
      environment: doc.environment,
    },
    actor_user_id: doc.created_by ?? null,
  } as any);

  const money =
    doc.total_amount != null
      ? Number(doc.total_amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "";

  if (doc.lead_id) {
    const title =
      status === "authorized"
        ? `NF-e ${doc.number ?? ""} autorizada`
        : status === "rejected" || status === "error"
          ? "NF-e rejeitada"
          : status === "cancelled"
            ? `NF-e ${doc.number ?? ""} cancelada`
            : "NF-e solicitada";
    await admin.from("activities").insert({
      workspace_id: doc.workspace_id,
      lead_id: doc.lead_id,
      contact_id: doc.contact_id ?? null,
      user_id: doc.created_by ?? null,
      type: "fiscal_nfe",
      title,
      content: [money, doc.access_key ? `Chave ${doc.access_key}` : null].filter(Boolean).join(" • "),
      metadata: { fiscal_document_id: doc.id, status, environment: doc.environment },
    } as any);
  }

  if (status === "authorized" || status === "rejected" || status === "error") {
    const recipients = new Set<string>();
    if (doc.owner_user_id) recipients.add(doc.owner_user_id);
    if (doc.created_by) recipients.add(doc.created_by);
    const { data: admins } = await admin
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", doc.workspace_id)
      .in("role", ["owner", "admin"]);
    for (const a of admins ?? []) recipients.add(a.user_id);

    const authorized = status === "authorized";
    for (const uid of recipients) {
      await admin
        .from("notifications")
        .insert({
          workspace_id: doc.workspace_id,
          recipient_user_id: uid,
          type: authorized ? "fiscal_nfe_authorized" : "fiscal_nfe_rejected",
          title: authorized ? "NF-e autorizada" : "NF-e rejeitada — ação necessária",
          body: authorized
            ? `NF-e ${doc.number ?? ""} autorizada ${money ? `(${money})` : ""}`.trim()
            : doc.rejection_message ?? "A SEFAZ rejeitou a NF-e.",
          lead_id: doc.lead_id ?? null,
          event_key: `fiscal:${doc.id}:${status}`,
          metadata: { fiscal_document_id: doc.id, status },
        } as any);
    }
  }
}
