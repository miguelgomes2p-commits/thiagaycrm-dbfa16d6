// Client-safe. Toda lógica server-only é carregada por dynamic import dentro dos handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FiscalConfigView } from "./fiscal/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function assertRole(supabase: any, workspaceId: string, roles: string[]) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data || !roles.includes(data.role)) throw new Error("Sem permissão fiscal para esta ação.");
  return data.role as string;
}

const ADMIN = ["owner", "admin"];

/* ============================ CONFIG ============================ */

export const getFiscalConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<FiscalConfigView> => {
    await assertRole(context.supabase, data.workspaceId, [...ADMIN, "manager", "agent"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadConfig, computeConfigStatus, configEnvironment } = await import("./fiscal/service.server");
    const cfg = await loadConfig(supabaseAdmin, data.workspaceId);
    const { count } = await supabaseAdmin
      .from("fiscal_profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("active", true);
    const { status, missing } = computeConfigStatus(cfg, (count ?? 0) > 0);
    return {
      exists: !!cfg,
      provider: cfg?.provider ?? "focus_nfe",
      environment: configEnvironment(cfg),
      production_enabled: !!cfg?.production_enabled,
      status,
      missing,
      certificate_status: cfg?.certificate_status ?? "missing",
      certificate_expires_at: cfg?.certificate_expires_at ?? null,
      certificate_filename: cfg?.certificate_filename ?? null,
      provider_company_id: cfg?.provider_company_id ?? null,
      has_token_homolog: !!cfg?.token_homolog_enc,
      has_token_prod: !!cfg?.token_prod_enc,
      accountant_checklist: (cfg?.accountant_checklist ?? {}) as Record<string, boolean>,
      emitter: {
        cnpj_emitente: cfg?.cnpj_emitente ?? null,
        ie_emitente: cfg?.ie_emitente ?? null,
        regime_tributario: cfg?.regime_tributario ?? null,
        serie_padrao: cfg?.serie_padrao ?? null,
        emit_razao_social: cfg?.emit_razao_social ?? null,
        emit_nome_fantasia: cfg?.emit_nome_fantasia ?? null,
        emit_telefone: cfg?.emit_telefone ?? null,
        emit_email: cfg?.emit_email ?? null,
        emit_cep: cfg?.emit_cep ?? null,
        emit_logradouro: cfg?.emit_logradouro ?? null,
        emit_numero: cfg?.emit_numero ?? null,
        emit_complemento: cfg?.emit_complemento ?? null,
        emit_bairro: cfg?.emit_bairro ?? null,
        emit_municipio: cfg?.emit_municipio ?? null,
        emit_ibge: cfg?.emit_ibge ?? null,
        emit_uf: cfg?.emit_uf ?? null,
      },
    };
  });

export const saveFiscalConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        emitter: z
          .object({
            emit_razao_social: z.string().max(200).optional(),
            emit_nome_fantasia: z.string().max(200).optional(),
            cnpj_emitente: z.string().max(20).optional(),
            ie_emitente: z.string().max(30).optional(),
            regime_tributario: z.number().int().min(1).max(4).optional(),
            serie_padrao: z.number().int().min(1).max(999).optional(),
            emit_telefone: z.string().max(20).optional(),
            emit_email: z.string().max(200).optional(),
            emit_cep: z.string().max(12).optional(),
            emit_logradouro: z.string().max(200).optional(),
            emit_numero: z.string().max(20).optional(),
            emit_complemento: z.string().max(100).optional(),
            emit_bairro: z.string().max(120).optional(),
            emit_municipio: z.string().max(120).optional(),
            emit_ibge: z.string().max(10).optional(),
            emit_uf: z.string().max(2).optional(),
          })
          .optional(),
        tokenHomolog: z.string().max(200).optional(),
        tokenProd: z.string().max(200).optional(),
        environment: z.enum(["homologation", "production"]).optional(),
        accountantChecklist: z.record(z.string(), z.boolean()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./renave.server");
    const { loadConfig } = await import("./fiscal/service.server");

    const patch: Record<string, any> = {
      workspace_id: data.workspaceId,
      provider: "focus_nfe",
      ...(data.emitter ?? {}),
    };
    if (data.accountantChecklist) patch.accountant_checklist = data.accountantChecklist;
    if (data.tokenHomolog !== undefined)
      patch.token_homolog_enc = data.tokenHomolog ? encryptSecret(data.tokenHomolog) : null;
    if (data.tokenProd !== undefined)
      patch.token_prod_enc = data.tokenProd ? encryptSecret(data.tokenProd) : null;

    if (data.environment) {
      if (data.environment === "production") {
        const cfg = await loadConfig(supabaseAdmin, data.workspaceId);
        if (!cfg?.production_enabled)
          throw new Error("Habilite a produção pelo Production Guard antes de trocar o ambiente.");
      }
      patch.environment = data.environment === "production" ? "producao" : "homologacao";
    }

    const { error } = await supabaseAdmin
      .from("nfe_config")
      .upsert(patch as any, { onConflict: "workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Upload do certificado A1: vai direto ao provider (custódia) — nunca é persistido no CRM. */
export const uploadFiscalCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        filename: z.string().max(200),
        fileBase64: z.string().min(100),
        password: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadConfig, recordAttempt, configEnvironment } = await import("./fiscal/service.server");
    const { createFiscalProvider } = await import("./fiscal/provider.server");
    const { decryptSecret } = await import("./renave.server");

    const cfg = await loadConfig(supabaseAdmin, data.workspaceId);
    if (!cfg?.cnpj_emitente || !cfg?.emit_razao_social)
      throw new Error("Preencha CNPJ e Razão Social do emitente antes de enviar o certificado.");
    const environment = configEnvironment(cfg);
    const enc = environment === "production" ? cfg.token_prod_enc : cfg.token_homolog_enc;
    if (!enc) throw new Error("Configure as credenciais do provedor fiscal antes do certificado.");

    const provider = createFiscalProvider({
      provider: cfg.provider ?? "focus_nfe",
      environment,
      token: decryptSecret(enc),
    });
    if (!provider.registerCompany) throw new Error("Provedor não suporta custódia de certificado.");

    const res = await provider.registerCompany({
      cnpj: cfg.cnpj_emitente.replace(/\D+/g, ""),
      razaoSocial: cfg.emit_razao_social,
      certificateBase64: data.fileBase64,
      certificatePassword: data.password,
    });

    await recordAttempt(supabaseAdmin, {
      workspaceId: data.workspaceId,
      documentId: null,
      provider: provider.name,
      action: "upload_certificate",
      status: res.ok ? "ok" : "error",
      httpStatus: res.httpStatus,
      ...(res.errorMessage ? { errorMessage: res.errorMessage } : {}),
    });

    if (!res.ok) {
      await supabaseAdmin
        .from("nfe_config")
        .update({ certificate_status: "error" })
        .eq("workspace_id", data.workspaceId);
      throw new Error(res.errorMessage ?? "Falha ao registrar o certificado no provedor fiscal.");
    }

    await supabaseAdmin
      .from("nfe_config")
      .update({
        certificate_status: "configured",
        certificate_filename: data.filename,
        certificate_uploaded_at: new Date().toISOString(),
        certificate_expires_at: res.certificateExpiresAt ?? null,
        provider_company_id: res.companyId ?? cfg.provider_company_id ?? null,
      } as any)
      .eq("workspace_id", data.workspaceId);

    // Nada de senha/arquivo é retornado ou logado.
    return { ok: true, expiresAt: res.certificateExpiresAt ?? null };
  });

export const enableFiscalProduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workspaceId: z.string().uuid(), confirm: z.literal(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadConfig, computeConfigStatus } = await import("./fiscal/service.server");
    const cfg = await loadConfig(supabaseAdmin, data.workspaceId);
    const { count } = await supabaseAdmin
      .from("fiscal_profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("active", true);
    const { missing } = computeConfigStatus(cfg, (count ?? 0) > 0);
    if (missing.length > 0)
      throw new Error(`Pendências: ${missing.map((m) => m.message).join("; ")}`);
    if (!cfg?.token_prod_enc) throw new Error("Credencial de produção do provedor não configurada.");

    const { count: okDocs } = await supabaseAdmin
      .from("fiscal_documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .eq("environment", "homologation")
      .eq("status", "authorized");
    if ((okDocs ?? 0) === 0)
      throw new Error("Emita ao menos uma NF-e autorizada em homologação antes de liberar produção.");

    await supabaseAdmin
      .from("nfe_config")
      .update({
        production_enabled: true,
        production_enabled_at: new Date().toISOString(),
        production_enabled_by: context.userId,
      } as any)
      .eq("workspace_id", data.workspaceId);
    return { ok: true };
  });

/* ============================ PERFIS FISCAIS ============================ */

export const listFiscalProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("fiscal_profiles")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertFiscalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        workspaceId: z.string().uuid(),
        name: z.string().min(2).max(120),
        operation_type: z.string().min(2).max(60),
        cfop: z.string().max(10).optional(),
        ncm: z.string().max(12).optional(),
        cest: z.string().max(12).optional(),
        product_origin: z.string().max(2).optional(),
        natureza_operacao: z.string().max(120).optional(),
        tax_configuration: z.record(z.string(), z.any()).optional(),
        additional_information: z.string().max(1000).optional(),
        is_default: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { workspaceId, id, ...rest } = data;
    if (rest.is_default) {
      await supabaseAdmin
        .from("fiscal_profiles")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId);
    }
    const row = { ...rest, workspace_id: workspaceId } as any;
    const res = id
      ? await supabaseAdmin.from("fiscal_profiles").update(row).eq("id", id).select("id").single()
      : await supabaseAdmin.from("fiscal_profiles").insert(row).select("id").single();
    if (res.error) throw new Error(res.error.message);
    return { ok: true, id: res.data.id };
  });

export const deleteFiscalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("fiscal_profiles").update({ active: false, is_default: false }).eq("id", data.id);
    return { ok: true };
  });

/* ============================ EMISSÃO ============================ */

const recipientSchema = z.object({
  person_type: z.enum(["PF", "PJ"]),
  name: z.string().min(2).max(200),
  cpf: z.string().max(20).optional(),
  cnpj: z.string().max(20).optional(),
  ie: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  zipcode: z.string().max(12),
  street: z.string().max(200),
  number: z.string().max(20),
  complement: z.string().max(100).optional(),
  district: z.string().max(120),
  city: z.string().max(120),
  ibge: z.string().max(10),
  uf: z.string().max(2),
  final_consumer: z.boolean().optional(),
  taxpayer: z.boolean().optional(),
});

const emissionInput = z.object({
  workspaceId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  fiscalProfileId: z.string().uuid(),
  amount: z.number().positive(),
  leadId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  recipient: recipientSchema.partial().extend({ person_type: z.enum(["PF", "PJ"]) }),
});

async function gatherEmissionContext(supabaseAdmin: any, data: z.infer<typeof emissionInput>) {
  const svc = await import("./fiscal/service.server");
  const cfg = await svc.loadConfig(supabaseAdmin, data.workspaceId);
  const { data: profile } = await supabaseAdmin
    .from("fiscal_profiles")
    .select("*")
    .eq("id", data.fiscalProfileId)
    .eq("workspace_id", data.workspaceId)
    .maybeSingle();
  const { data: vehicle } = await supabaseAdmin
    .from("vehicles")
    .select("*")
    .eq("id", data.vehicleId)
    .eq("workspace_id", data.workspaceId)
    .maybeSingle();

  const issues = [
    ...svc.missingEmitterFields(cfg),
    ...(cfg?.certificate_status === "configured"
      ? []
      : [{ field: "certificate", message: "Certificado digital não configurado" }]),
    ...svc.validateProfile(profile),
    ...svc.validateRecipient(data.recipient),
    ...(vehicle ? [] : [{ field: "vehicle", message: "Veículo não encontrado" }]),
  ];
  return { svc, cfg, profile, vehicle, issues };
}

export const validateFiscalEmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => emissionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cfg, profile, vehicle, issues, svc } = await gatherEmissionContext(supabaseAdmin, data);
    return {
      ok: issues.length === 0,
      issues,
      environment: svc.configEnvironment(cfg),
      preview:
        issues.length === 0 && cfg && profile && vehicle
          ? {
              issuer: svc.buildIssuerSnapshot(cfg),
              vehicle: svc.vehicleDescription(vehicle),
              profileName: profile.name as string,
              cfop: profile.cfop as string,
              ncm: profile.ncm as string,
              amount: data.amount,
            }
          : null,
    };
  });

export const issueFiscalNfe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => emissionInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cfg, profile, vehicle, issues, svc } = await gatherEmissionContext(supabaseAdmin, data);
    if (issues.length > 0) return { ok: false as const, issues };

    const recipient = data.recipient as any;
    const environment = svc.configEnvironment(cfg);
    const idempotencyKey = `nfe:${data.workspaceId}:${data.vehicleId}:${data.leadId ?? "no-lead"}`;

    // Idempotência: um documento vivo por venda.
    const { data: existing } = await supabaseAdmin
      .from("fiscal_documents")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing && !["rejected", "error"].includes(existing.status)) {
      return { ok: true as const, documentId: existing.id, status: existing.status, reused: true };
    }

    const payload = svc.buildNfePayload({
      cfg: cfg!,
      profile,
      vehicle,
      recipient,
      amount: data.amount,
    });

    const ref = existing?.provider_document_id ?? `nfe-${data.vehicleId.slice(0, 8)}-${Date.now()}`;
    const docRow = {
      workspace_id: data.workspaceId,
      document_type: "NFE",
      environment,
      provider: cfg!.provider ?? "focus_nfe",
      provider_document_id: ref,
      vehicle_id: data.vehicleId,
      lead_id: data.leadId ?? null,
      contact_id: data.contactId ?? null,
      fiscal_profile_id: data.fiscalProfileId,
      owner_user_id: context.userId,
      created_by: context.userId,
      status: "processing",
      series: String(cfg!.serie_padrao ?? 1),
      total_amount: data.amount,
      idempotency_key: idempotencyKey,
      issued_at: new Date().toISOString(),
      rejection_code: null,
      rejection_message: null,
      issuer_snapshot: svc.buildIssuerSnapshot(cfg!),
      recipient_snapshot: recipient,
      items_snapshot: (payload as any).items,
      tax_snapshot: {
        profile: { id: profile.id, name: profile.name, cfop: profile.cfop, ncm: profile.ncm },
        tax_configuration: profile.tax_configuration ?? {},
      },
    } as any;

    const upserted = existing
      ? await supabaseAdmin.from("fiscal_documents").update(docRow).eq("id", existing.id).select("id").single()
      : await supabaseAdmin.from("fiscal_documents").insert(docRow).select("id").single();
    if (upserted.error) throw new Error(upserted.error.message);
    const documentId = upserted.data.id as string;

    const { provider } = await svc.getProviderForWorkspace(supabaseAdmin, data.workspaceId);
    const res = await provider.issueNFe({ ref, payload });
    await svc.recordAttempt(supabaseAdmin, {
      workspaceId: data.workspaceId,
      documentId,
      provider: provider.name,
      action: "issue",
      status: res.ok ? "sent" : "error",
      httpStatus: res.httpStatus,
      ...(res.errorCode ? { errorCode: res.errorCode } : {}),
      ...(res.errorMessage ? { errorMessage: res.errorMessage } : {}),
    });
    const doc = await svc.applyProviderResult(supabaseAdmin, provider, documentId, res);
    return { ok: true as const, documentId, status: doc?.status ?? "processing" };
  });

export const syncFiscalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, [...ADMIN, "manager"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");
    const { data: doc } = await supabaseAdmin
      .from("fiscal_documents")
      .select("id, provider_document_id, workspace_id")
      .eq("id", data.documentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!doc?.provider_document_id) throw new Error("Documento sem referência no provedor.");
    const { provider } = await svc.getProviderForWorkspace(supabaseAdmin, data.workspaceId);
    const res = await provider.getNFe({ ref: doc.provider_document_id });
    await svc.recordAttempt(supabaseAdmin, {
      workspaceId: data.workspaceId,
      documentId: doc.id,
      provider: provider.name,
      action: "sync",
      status: res.ok ? "ok" : "error",
      httpStatus: res.httpStatus,
      ...(res.errorMessage ? { errorMessage: res.errorMessage } : {}),
    });
    const updated = await svc.applyProviderResult(supabaseAdmin, provider, doc.id, res);
    return { ok: true, status: updated?.status };
  });

export const cancelFiscalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        documentId: z.string().uuid(),
        reason: z.string().min(15).max(255),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");
    const { data: doc } = await supabaseAdmin
      .from("fiscal_documents")
      .select("id, provider_document_id, status")
      .eq("id", data.documentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!doc) throw new Error("Documento não encontrado.");
    if (doc.status !== "authorized") throw new Error("Somente NF-e autorizada pode ser cancelada.");
    const { provider } = await svc.getProviderForWorkspace(supabaseAdmin, data.workspaceId);
    const res = await provider.cancelNFe({ ref: doc.provider_document_id!, reason: data.reason });
    await svc.recordAttempt(supabaseAdmin, {
      workspaceId: data.workspaceId,
      documentId: doc.id,
      provider: provider.name,
      action: "cancel",
      status: res.ok ? "ok" : "error",
      httpStatus: res.httpStatus,
      ...(res.errorMessage ? { errorMessage: res.errorMessage } : {}),
    });
    if (!res.ok) throw new Error(res.errorMessage ?? "Falha ao cancelar a NF-e.");
    await supabaseAdmin
      .from("fiscal_documents")
      .update({ cancel_reason: data.reason })
      .eq("id", doc.id);
    const updated = await svc.applyProviderResult(supabaseAdmin, provider, doc.id, {
      ...res,
      status: "cancelado",
    });
    return { ok: true, status: updated?.status };
  });

/* ============================ CONSULTA ============================ */

export const listFiscalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        status: z.string().max(20).optional(),
        search: z.string().max(120).optional(),
        vehicleId: z.string().uuid().optional(),
        from: z.string().max(30).optional(),
        to: z.string().max(30).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("fiscal_documents")
      .select(
        "id, status, environment, number, series, access_key, total_amount, created_at, authorized_at, rejection_message, vehicle_id, lead_id, recipient_snapshot, xml_storage_path, danfe_storage_path, cancel_reason",
      )
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    if (data.vehicleId) q = q.eq("vehicle_id", data.vehicleId);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const term = data.search?.trim().toLowerCase();
    const filtered = term
      ? (rows ?? []).filter((r: any) => {
          const rec = r.recipient_snapshot ?? {};
          return [r.number, r.access_key, rec.name, rec.cpf, rec.cnpj]
            .filter(Boolean)
            .some((v: string) => String(v).toLowerCase().includes(term));
        })
      : (rows ?? []);

    const vehicleIds = [...new Set(filtered.map((r: any) => r.vehicle_id).filter(Boolean))];
    const vehicles: Record<string, string> = {};
    if (vehicleIds.length) {
      const { data: vs } = await context.supabase
        .from("vehicles")
        .select("id, brand, model, version, year_model")
        .in("id", vehicleIds as string[]);
      for (const v of vs ?? [])
        vehicles[v.id] = [v.brand, v.model, v.version].filter(Boolean).join(" ");
    }
    return filtered.map((r: any) => ({ ...r, vehicle_label: r.vehicle_id ? vehicles[r.vehicle_id] ?? null : null }));
  });

export const getFiscalDocumentLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS garante que só quem pode ver o documento obtém links.
    const { data: doc, error } = await context.supabase
      .from("fiscal_documents")
      .select("id, xml_storage_path, danfe_storage_path")
      .eq("id", data.documentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento não encontrado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sign = async (path: string | null) => {
      if (!path) return null;
      const { data: s } = await supabaseAdmin.storage.from("fiscal-docs").createSignedUrl(path, 300);
      return s?.signedUrl ?? null;
    };
    return { xmlUrl: await sign(doc.xml_storage_path), danfeUrl: await sign(doc.danfe_storage_path) };
  });
