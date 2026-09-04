// Camada AUTOMOTIVA do FiscalService. Reutiliza integralmente
// service.server.ts (config, provider, snapshots, attempts, storage, eventos).
// SERVER-ONLY: importar apenas por dynamic import dentro de handlers.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildIcmsGroup,
  buildIssuerSnapshot,

  missingEmitterFields,
  onlyDigits,
  validateProfile,
  validateRecipient,
  vehicleAdditionalInfo,
  vehicleDescription,
  type FiscalConfigRow,
  type RecipientInput,
} from "./service.server";
import {
  operationDef,
  resolveVehicleFiscalOperation,
  taxpayerIndicatorCode,
  type FiscalOperationKey,
  type TaxpayerIndicator,
} from "./operations";
import { certificateAllowsIssue, type FiscalValidationIssue } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;

/* ----------------------- resolução do perfil fiscal ----------------------- */

/**
 * Busca o Fiscal Operation Profile ATIVO e vigente do workspace para a
 * operação. Não há fallback tributário: sem perfil, a emissão é bloqueada.
 */
export async function findOperationProfile(
  admin: Admin,
  workspaceId: string,
  operationKey: FiscalOperationKey,
): Promise<Record<string, any> | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("fiscal_profiles")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("operation_key", operationKey)
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Record<string, any>[];
  const vigentes = rows.filter(
    (p) => (!p.valid_from || p.valid_from <= today) && (!p.valid_to || p.valid_to >= today),
  );
  return vigentes[0] ?? rows[0] ?? null;
}

export type VehicleOperationContext = {
  operationKey: FiscalOperationKey;
  direction: "entry" | "exit";
  selfIssued: boolean;
  supportsSelfIssue: boolean;
  profile: Record<string, any> | null;
};

export async function resolveVehicleOperationContext(
  admin: Admin,
  input: {
    workspaceId: string;
    vehicle: Record<string, any>;
    transactionType: "purchase" | "sale";
  },
): Promise<VehicleOperationContext> {
  const resolved = resolveVehicleFiscalOperation({
    transactionType: input.transactionType,
    acquisitionSource: input.vehicle.acquisition_source ?? null,
    ownershipType: input.vehicle.ownership_type ?? "owned",
  });
  const profile = await findOperationProfile(admin, input.workspaceId, resolved.operationKey);
  return { ...resolved, profile };
}

/* ----------------------------- validação ----------------------------- */

export function validateVehicleForFiscal(v: Record<string, any> | null): FiscalValidationIssue[] {
  if (!v) return [{ field: "vehicle", message: "Veículo não encontrado" }];
  const out: FiscalValidationIssue[] = [];
  if (!v.brand || !v.model) out.push({ field: "vehicle", message: "Marca/modelo do veículo ausente" });
  if (!v.chassis) out.push({ field: "chassis", message: "Chassi do veículo ausente" });
  return out;
}

/**
 * validateFiscalOperation — checagem completa ANTES de chamar o provider.
 * Retorna pendências específicas por operação; nunca inventa tributação.
 */
export function validateFiscalOperation(input: {
  cfg: FiscalConfigRow | null;
  ctx: VehicleOperationContext;
  vehicle: Record<string, any> | null;
  counterparty: Partial<RecipientInput> | null;
  amount: number | null;
  requireIbsCbs?: boolean;
}): FiscalValidationIssue[] {
  const { cfg, ctx, vehicle, counterparty, amount } = input;
  const issues: FiscalValidationIssue[] = [...missingEmitterFields(cfg)];

  // "external_declared" = administrador informou custódia na Focus; a Focus
  // continua sendo a autoridade final na primeira emissão.
  if (!certificateAllowsIssue(cfg?.certificate_status))
    issues.push({ field: "certificate", message: "Certificado digital A1 não configurado" });

  if (cfg?.certificate_expires_at && new Date(cfg.certificate_expires_at) < new Date())
    issues.push({ field: "certificate", message: "Certificado digital expirado" });

  const def = operationDef(ctx.operationKey);
  if (!ctx.profile) {
    issues.push({
      field: "fiscal_profile",
      message: `Esta empresa ainda não possui um perfil fiscal configurado para "${def?.label ?? ctx.operationKey}".`,
    });
  } else {
    issues.push(...validateProfile(ctx.profile));
    if (ctx.profile.direction && ctx.profile.direction !== ctx.direction)
      issues.push({
        field: "fiscal_profile",
        message: "O perfil fiscal selecionado é de sentido diferente da operação.",
      });
    if (input.requireIbsCbs) {
      const tax = (ctx.profile.tax_configuration ?? {}) as Record<string, any>;
      if (tax.ibs == null && tax.ibs_cst == null)
        issues.push({ field: "ibs", message: "IBS não configurado no perfil fiscal" });
      if (tax.cbs == null && tax.cbs_cst == null)
        issues.push({ field: "cbs", message: "CBS não configurado no perfil fiscal" });
    }
  }

  issues.push(...validateVehicleForFiscal(vehicle));
  issues.push(...validateRecipient(counterparty ?? {}));
  if (!amount || amount <= 0)
    issues.push({ field: "amount", message: "Valor da operação ausente ou inválido" });

  return issues;
}

/* ------------------------------ payload ------------------------------ */

export type VehicleNfeBuildInput = {
  cfg: FiscalConfigRow;
  profile: Record<string, any>;
  vehicle: Record<string, any>;
  /** destinatário (saída) ou remetente/vendedor (entrada) */
  counterparty: RecipientInput & {
    taxpayer_indicator?: TaxpayerIndicator;
  };
  amount: number;
  direction: "entry" | "exit";
  operationKey: FiscalOperationKey;
  buyerPresence?: number;
};

/**
 * Monta o payload NF-e modelo 55 de ENTRADA ou SAÍDA.
 * Todos os campos tributários vêm do perfil; nada é inventado aqui.
 */
export function buildVehicleNfePayload(input: VehicleNfeBuildInput) {
  const { cfg, profile, vehicle, counterparty, amount, direction } = input;
  const tax = (profile.tax_configuration ?? {}) as Record<string, any>;
  const value = amount.toFixed(2);
  const interstate = (counterparty.uf ?? "").toUpperCase() !== (cfg.emit_uf ?? "").toUpperCase();
  const cfop = (interstate ? profile.cfop_interstate : profile.cfop) || profile.cfop;

  const item: Record<string, unknown> = {
    numero_item: 1,
    codigo_produto: vehicle.stock_code || vehicle.chassis?.slice(-10) || "VEIC001",
    descricao: vehicleDescription(vehicle) || "Veículo automotor",
    codigo_ncm: profile.ncm,
    cfop,
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
    ...tax,
    ...buildIcmsGroup(profile, amount).group,

  };

  const isPJ = counterparty.person_type === "PJ";
  const parte = isPJ
    ? {
        cnpj_destinatario: onlyDigits(counterparty.cnpj),
        inscricao_estadual_destinatario: counterparty.ie || "ISENTO",
        indicador_inscricao_estadual_destinatario: taxpayerIndicatorCode(
          counterparty.taxpayer_indicator ?? (counterparty.taxpayer ? "contributor" : "non_contributor"),
        ),
      }
    : {
        cpf_destinatario: onlyDigits(counterparty.cpf),
        indicador_inscricao_estadual_destinatario: taxpayerIndicatorCode(
          counterparty.taxpayer_indicator ?? "non_contributor",
        ),
      };

  return {
    natureza_operacao: profile.natureza_operacao,
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    // 0 = entrada, 1 = saída
    tipo_documento: direction === "entry" ? 0 : 1,
    finalidade_emissao: 1,
    consumidor_final: profile.final_consumer === false ? 0 : counterparty.final_consumer === false ? 0 : 1,
    presenca_comprador: input.buyerPresence ?? profile.buyer_presence ?? 9,
    modalidade_frete: 9,
    local_destino: interstate ? 2 : 1,
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
    nome_destinatario: counterparty.name,
    ...parte,
    email_destinatario: counterparty.email || undefined,
    telefone_destinatario: onlyDigits(counterparty.phone),
    logradouro_destinatario: counterparty.street,
    numero_destinatario: counterparty.number,
    complemento_destinatario: counterparty.complement || undefined,
    bairro_destinatario: counterparty.district,
    municipio_destinatario: counterparty.city,
    codigo_municipio_destinatario: counterparty.ibge,
    uf_destinatario: counterparty.uf,
    cep_destinatario: onlyDigits(counterparty.zipcode),
    items: [item],
    valor_produtos: value,
    valor_total: value,
    informacoes_adicionais_contribuinte: [profile.additional_information, vehicleAdditionalInfo(vehicle)]
      .filter(Boolean)
      .join(" | "),
  };
}

export function buildVehicleSnapshot(v: Record<string, any>) {
  return {
    id: v.id,
    stock_code: v.stock_code,
    descricao: vehicleDescription(v),
    brand: v.brand,
    model: v.model,
    version: v.version,
    year_manufacture: v.year_manufacture,
    year_model: v.year_model,
    chassis: v.chassis,
    renavam: v.renavam,
    plate: v.plate,
    color: v.color,
    fuel: v.fuel,
    mileage: v.mileage,
    acquisition_source: v.acquisition_source,
    ownership_type: v.ownership_type,
  };
}

export function buildOperationSnapshot(ctx: VehicleOperationContext, extra?: Record<string, unknown>) {
  const def = operationDef(ctx.operationKey);
  return {
    operation_key: ctx.operationKey,
    operation_label: def?.label ?? ctx.operationKey,
    direction: ctx.direction,
    self_issued: ctx.selfIssued,
    profile: ctx.profile
      ? {
          id: ctx.profile.id,
          name: ctx.profile.name,
          cfop: ctx.profile.cfop,
          cfop_interstate: ctx.profile.cfop_interstate,
          ncm: ctx.profile.ncm,
          cest: ctx.profile.cest,
          natureza_operacao: ctx.profile.natureza_operacao,
          accountant_validated: ctx.profile.accountant_validated,
        }
      : null,
    ...(extra ?? {}),
  };
}

export { buildIssuerSnapshot };

/* --------------------------- importação de XML --------------------------- */

function tagValue(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m?.[1]?.trim() || undefined;
}

function blockOf(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m?.[1] ?? "";
}

export type ParsedSupplierNfe = {
  accessKey: string;
  number?: string;
  series?: string;
  issueDate?: string;
  totalAmount?: number;
  issuer: { cnpj?: string; name?: string; ie?: string; uf?: string; city?: string };
  recipient: { cnpj?: string; cpf?: string; name?: string };
  items: Array<{ descricao?: string; ncm?: string; cfop?: string; valor?: number; chassi?: string }>;
};

/**
 * Parser server-side do XML autorizado do fornecedor.
 * Nunca confiamos em dados extraídos no frontend.
 */
export function parseSupplierNfeXml(xml: string): ParsedSupplierNfe {
  const infNfe = xml.match(/<infNFe[^>]*Id="NFe(\d{44})"/i);
  const accessKey = infNfe?.[1] ?? tagValue(xml, "chNFe") ?? "";
  if (!/^\d{44}$/.test(accessKey))
    throw new Error("XML inválido: chave de acesso da NF-e não encontrada.");

  const ide = blockOf(xml, "ide");
  const emit = blockOf(xml, "emit");
  const dest = blockOf(xml, "dest");
  const total = blockOf(xml, "ICMSTot");

  const items: ParsedSupplierNfe["items"] = [];
  const detRe = /<det[^>]*>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = detRe.exec(xml)) !== null) {
    const det = m[1] ?? "";
    const veicProd = blockOf(det, "veicProd");
    items.push({
      ...(tagValue(det, "xProd") ? { descricao: tagValue(det, "xProd")! } : {}),
      ...(tagValue(det, "NCM") ? { ncm: tagValue(det, "NCM")! } : {}),
      ...(tagValue(det, "CFOP") ? { cfop: tagValue(det, "CFOP")! } : {}),
      ...(tagValue(det, "vProd") ? { valor: Number(tagValue(det, "vProd")) } : {}),
      ...(veicProd && tagValue(veicProd, "chassi") ? { chassi: tagValue(veicProd, "chassi")! } : {}),
    });
  }

  const vNF = tagValue(total, "vNF");
  const out: ParsedSupplierNfe = {
    accessKey,
    issuer: {
      ...(tagValue(emit, "CNPJ") ? { cnpj: tagValue(emit, "CNPJ")! } : {}),
      ...(tagValue(emit, "xNome") ? { name: tagValue(emit, "xNome")! } : {}),
      ...(tagValue(emit, "IE") ? { ie: tagValue(emit, "IE")! } : {}),
      ...(tagValue(emit, "UF") ? { uf: tagValue(emit, "UF")! } : {}),
      ...(tagValue(emit, "xMun") ? { city: tagValue(emit, "xMun")! } : {}),
    },
    recipient: {
      ...(tagValue(dest, "CNPJ") ? { cnpj: tagValue(dest, "CNPJ")! } : {}),
      ...(tagValue(dest, "CPF") ? { cpf: tagValue(dest, "CPF")! } : {}),
      ...(tagValue(dest, "xNome") ? { name: tagValue(dest, "xNome")! } : {}),
    },
    items,
    ...(tagValue(ide, "nNF") ? { number: tagValue(ide, "nNF")! } : {}),
    ...(tagValue(ide, "serie") ? { series: tagValue(ide, "serie")! } : {}),
    ...(tagValue(ide, "dhEmi") ? { issueDate: tagValue(ide, "dhEmi")!.slice(0, 10) } : {}),
    ...(vNF ? { totalAmount: Number(vNF) } : {}),
  };
  return out;
}

/* ------------------------------ eventos ------------------------------ */

/** Eventos de domínio automotivos no Event Bus já existente (crm_events). */
export async function emitVehicleFiscalEvent(
  admin: Admin,
  input: {
    workspaceId: string;
    eventType: string;
    vehicleId: string;
    documentId?: string | null;
    payload?: Record<string, unknown>;
    actorUserId?: string | null;
  },
) {
  await admin.from("crm_events").insert({
    workspace_id: input.workspaceId,
    event_type: input.eventType,
    entity_type: "vehicle",
    entity_id: input.vehicleId,
    payload: { fiscal_document_id: input.documentId ?? null, ...(input.payload ?? {}) },
    actor_user_id: input.actorUserId ?? null,
  } as any);
}
