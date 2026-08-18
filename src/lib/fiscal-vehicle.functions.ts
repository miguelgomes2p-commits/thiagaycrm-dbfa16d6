// Server functions do FISCAL AUTOMOTIVO (garagens/revendas).
// Client-safe: todo código server-only entra por dynamic import no handler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FiscalOperationKey } from "./fiscal/operations";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ADMIN = ["owner", "admin"];
const VIEWERS = ["owner", "admin", "manager", "agent"];

async function assertRole(supabase: any, workspaceId: string, roles: string[]) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data || !roles.includes(data.role)) throw new Error("Sem permissão fiscal para esta ação.");
  return data.role as string;
}

const counterpartySchema = z.object({
  person_type: z.enum(["PF", "PJ"]),
  name: z.string().max(200).optional(),
  cpf: z.string().max(20).optional(),
  cnpj: z.string().max(20).optional(),
  ie: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  zipcode: z.string().max(12).optional(),
  street: z.string().max(200).optional(),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  district: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  ibge: z.string().max(10).optional(),
  uf: z.string().max(2).optional(),
  taxpayer_indicator: z.enum(["contributor", "exempt", "non_contributor"]).optional(),
  final_consumer: z.boolean().optional(),
});

/* ==================== STATUS FISCAL DO VEÍCULO ==================== */

export const getVehicleFiscalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, VIEWERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");
    const auto = await import("./fiscal/vehicle-fiscal.server");

    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", data.vehicleId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!vehicle) throw new Error("Veículo não encontrado.");

    const cfg = await svc.loadConfig(supabaseAdmin, data.workspaceId);
    const entry = await auto.resolveVehicleOperationContext(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicle,
      transactionType: "purchase",
    });
    const sale = await auto.resolveVehicleOperationContext(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicle,
      transactionType: "sale",
    });

    const { data: docs } = await supabaseAdmin
      .from("fiscal_documents")
      .select(
        "id, direction, source, issuer_type, self_issued, operation_key, status, environment, number, series, access_key, total_amount, created_at, authorized_at, cancelled_at, rejection_message, xml_storage_path, danfe_storage_path, supplier_snapshot, recipient_snapshot",
      )
      .eq("workspace_id", data.workspaceId)
      .eq("vehicle_id", data.vehicleId)
      .order("created_at", { ascending: false });

    const { data: fin } = await supabaseAdmin
      .from("vehicle_financials")
      .select("acquisition_cost, sale_amount, sale_date, sold_to_lead_id")
      .eq("vehicle_id", data.vehicleId)
      .maybeSingle();

    const summarize = (ctx: typeof entry) => ({
      operation_key: ctx.operationKey,
      direction: ctx.direction,
      self_issued: ctx.selfIssued,
      supports_self_issue: ctx.supportsSelfIssue,
      profile_id: (ctx.profile?.id as string) ?? null,
      profile_name: (ctx.profile?.name as string) ?? null,
      profile_configured: !!ctx.profile,
    });

    return {
      vehicle: {
        id: vehicle.id,
        acquisition_source: vehicle.acquisition_source ?? null,
        ownership_type: vehicle.ownership_type ?? "owned",
        acquisition_details: vehicle.acquisition_details ?? {},
        status: vehicle.status,
      },
      environment: svc.configEnvironment(cfg),
      entry: summarize(entry),
      sale: summarize(sale),
      documents: docs ?? [],
      financial: fin ?? null,
      // divergência é apenas sinalizada; nunca sobrescreve o financeiro
      divergence: (() => {
        const exit = (docs ?? []).find((d: any) => d.direction === "exit" && d.status === "authorized");
        if (!exit || fin?.sale_amount == null) return null;
        return Number(exit.total_amount) !== Number(fin.sale_amount)
          ? { fiscal: Number(exit.total_amount), financial: Number(fin.sale_amount) }
          : null;
      })(),
    };
  });

/* ==================== RASCUNHO ==================== */

const draftInput = z.object({
  workspaceId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  transactionType: z.enum(["purchase", "sale"]),
  amount: z.number().positive(),
  counterparty: counterpartySchema,
  leadId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  buyerPresence: z.number().int().min(0).max(9).optional(),
});

function idempotencyKeyFor(input: {
  workspaceId: string;
  vehicleId: string;
  transactionType: "purchase" | "sale";
  leadId?: string | null;
}) {
  return input.transactionType === "purchase"
    ? `vehicle-entry:${input.workspaceId}:${input.vehicleId}`
    : `vehicle-sale:${input.workspaceId}:${input.vehicleId}:${input.leadId ?? "no-lead"}`;
}

/** Valida a operação sem chamar o provedor. */
export const validateVehicleFiscalOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => draftInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, VIEWERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");
    const auto = await import("./fiscal/vehicle-fiscal.server");

    const cfg = await svc.loadConfig(supabaseAdmin, data.workspaceId);
    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", data.vehicleId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const ctx = await auto.resolveVehicleOperationContext(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicle: vehicle ?? {},
      transactionType: data.transactionType,
    });
    const issues = auto.validateFiscalOperation({
      cfg,
      ctx,
      vehicle,
      counterparty: data.counterparty as any,
      amount: data.amount,
      requireIbsCbs: !!cfg?.require_ibs_cbs,
    });
    if (!ctx.supportsSelfIssue)
      issues.unshift({
        field: "operation",
        message:
          "Nesta operação o fornecedor é o emitente do documento. Importe a NF-e recebida em vez de emitir.",
      });
    return {
      ok: issues.length === 0,
      issues,
      operation_key: ctx.operationKey,
      direction: ctx.direction,
      profile_name: (ctx.profile?.name as string) ?? null,
      environment: svc.configEnvironment(cfg),
    };
  });

/** Cria (ou reaproveita) o rascunho do documento. Não chama o provedor. */
export const createVehicleFiscalDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => draftInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");
    const auto = await import("./fiscal/vehicle-fiscal.server");

    const cfg = await svc.loadConfig(supabaseAdmin, data.workspaceId);
    if (!cfg) throw new Error("Configuração fiscal não iniciada.");
    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", data.vehicleId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!vehicle) throw new Error("Veículo não encontrado.");

    const ctx = await auto.resolveVehicleOperationContext(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicle,
      transactionType: data.transactionType,
    });
    if (!ctx.supportsSelfIssue)
      throw new Error(
        "Nesta operação o fornecedor é o emitente. Utilize a importação da NF-e recebida.",
      );
    if (!ctx.profile)
      throw new Error("Configuração fiscal necessária: nenhum perfil ativo para esta operação.");

    const idempotency_key = idempotencyKeyFor({ ...data, leadId: data.leadId ?? null });
    const { data: existing } = await supabaseAdmin
      .from("fiscal_documents")
      .select("id, status")
      .eq("workspace_id", data.workspaceId)
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();
    if (existing && !["rejected", "error", "cancelled"].includes(existing.status))
      return { ok: true, documentId: existing.id, status: existing.status, reused: true };

    const row = {
      workspace_id: data.workspaceId,
      document_type: "NFE",
      environment: svc.configEnvironment(cfg),
      provider: cfg.provider ?? "focus_nfe",
      vehicle_id: data.vehicleId,
      lead_id: data.leadId ?? null,
      contact_id: data.contactId ?? null,
      fiscal_profile_id: ctx.profile.id,
      operation_key: ctx.operationKey,
      direction: ctx.direction,
      issuer_type: "self",
      self_issued: true,
      source: "issued",
      owner_user_id: context.userId,
      created_by: context.userId,
      status: "draft",
      series: String(cfg.serie_padrao ?? 1),
      total_amount: data.amount,
      idempotency_key,
      issuer_snapshot: svc.buildIssuerSnapshot(cfg),
      recipient_snapshot: { ...data.counterparty, buyer_presence: data.buyerPresence ?? null },
      vehicle_snapshot: auto.buildVehicleSnapshot(vehicle),
      operation_snapshot: auto.buildOperationSnapshot(ctx, {
        transaction_type: data.transactionType,
      }),
      items_snapshot: [],
      tax_snapshot: {
        profile: { id: ctx.profile.id, name: ctx.profile.name },
        tax_configuration: ctx.profile.tax_configuration ?? {},
      },
    } as any;

    const res = existing
      ? await supabaseAdmin.from("fiscal_documents").update(row).eq("id", existing.id).select("id").single()
      : await supabaseAdmin.from("fiscal_documents").insert(row).select("id").single();
    if (res.error) throw new Error(res.error.message);

    await auto.emitVehicleFiscalEvent(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicleId: data.vehicleId,
      documentId: res.data.id,
      actorUserId: context.userId,
      eventType:
        ctx.direction === "entry" ? "vehicle.fiscal_entry_pending" : "vehicle.sale_fiscal_pending",
      payload: { operation_key: ctx.operationKey, amount: data.amount },
    });

    return { ok: true, documentId: res.data.id as string, status: "draft", reused: false };
  });

/* ==================== EMISSÃO ==================== */

export const issueVehicleFiscalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workspaceId: z.string().uuid(), documentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");
    const auto = await import("./fiscal/vehicle-fiscal.server");

    const { data: doc } = await supabaseAdmin
      .from("fiscal_documents")
      .select("*")
      .eq("id", data.documentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!doc) throw new Error("Documento não encontrado.");
    if (doc.source === "imported") throw new Error("Documento recebido de fornecedor não é emitido pelo CRM.");
    if (doc.status === "authorized")
      return { ok: true, status: "authorized", documentId: doc.id, reused: true };
    if (doc.status === "processing") {
      // consulta antes de qualquer reemissão
      const { provider } = await svc.getProviderForWorkspace(supabaseAdmin, data.workspaceId);
      if (doc.provider_document_id) {
        const res = await provider.getNFe({ ref: doc.provider_document_id });
        const updated = await svc.applyProviderResult(supabaseAdmin, provider, doc.id, res);
        return { ok: true, status: updated?.status ?? "processing", documentId: doc.id, reused: true };
      }
    }

    const vehicleId = doc.vehicle_id as string | null;
    if (!vehicleId) throw new Error("Documento sem veículo vinculado.");
    const direction: "entry" | "exit" = doc.direction === "entry" ? "entry" : "exit";

    const cfg = await svc.loadConfig(supabaseAdmin, data.workspaceId);
    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .maybeSingle();
    const ctx = await auto.resolveVehicleOperationContext(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicle: vehicle ?? {},
      transactionType: direction === "entry" ? "purchase" : "sale",
    });
    const counterparty = (doc.recipient_snapshot ?? {}) as Record<string, any>;
    const issues = auto.validateFiscalOperation({
      cfg,
      ctx,
      vehicle,
      counterparty,
      amount: Number(doc.total_amount),
      requireIbsCbs: !!cfg?.require_ibs_cbs,
    });
    if (issues.length > 0) return { ok: false as const, issues, documentId: doc.id };

    // trava de concorrência: só sai de draft/rejected uma única vez
    const ref = doc.provider_document_id ?? `nfe-${String(doc.id).slice(0, 8)}-${Date.now()}`;
    const { data: locked } = await supabaseAdmin
      .from("fiscal_documents")
      .update({
        status: "processing",
        provider_document_id: ref,
        issued_at: new Date().toISOString(),
        rejection_code: null,
        rejection_message: null,
      })
      .eq("id", doc.id)
      .in("status", ["draft", "rejected", "error"])
      .select("id")
      .maybeSingle();
    if (!locked) {
      const { data: fresh } = await supabaseAdmin
        .from("fiscal_documents")
        .select("status")
        .eq("id", doc.id)
        .maybeSingle();
      return { ok: true, status: fresh?.status ?? "processing", documentId: doc.id, reused: true };
    }

    const payload = auto.buildVehicleNfePayload({
      cfg: cfg!,
      profile: ctx.profile!,
      vehicle: vehicle!,
      counterparty,
      amount: Number(doc.total_amount),
      direction: doc.direction,
      operationKey: ctx.operationKey as FiscalOperationKey,
      ...(counterparty.buyer_presence != null ? { buyerPresence: counterparty.buyer_presence } : {}),
    });

    await supabaseAdmin
      .from("fiscal_documents")
      .update({
        items_snapshot: (payload as any).items,
        tax_snapshot: {
          profile: { id: ctx.profile!.id, name: ctx.profile!.name, cfop: ctx.profile!.cfop },
          tax_configuration: ctx.profile!.tax_configuration ?? {},
        },
        operation_snapshot: auto.buildOperationSnapshot(ctx),
        vehicle_snapshot: auto.buildVehicleSnapshot(vehicle!),
      } as any)
      .eq("id", doc.id);

    const { provider } = await svc.getProviderForWorkspace(supabaseAdmin, data.workspaceId);
    const res = await provider.issueNFe({ ref, payload });
    await svc.recordAttempt(supabaseAdmin, {
      workspaceId: data.workspaceId,
      documentId: doc.id,
      provider: provider.name,
      action: doc.direction === "entry" ? "issue_entry" : "issue_exit",
      status: res.ok ? "sent" : "error",
      httpStatus: res.httpStatus,
      ...(res.errorCode ? { errorCode: res.errorCode } : {}),
      ...(res.errorMessage ? { errorMessage: res.errorMessage } : {}),
    });
    const updated = await svc.applyProviderResult(supabaseAdmin, provider, doc.id, res);

    if (updated?.status === "authorized") {
      await auto.emitVehicleFiscalEvent(supabaseAdmin, {
        workspaceId: data.workspaceId,
        vehicleId: doc.vehicle_id,
        documentId: doc.id,
        actorUserId: context.userId,
        eventType:
          doc.direction === "entry"
            ? "vehicle.fiscal_entry_authorized"
            : "vehicle.sale_fiscal_authorized",
        payload: { number: updated.number ?? null, access_key: updated.access_key ?? null },
      });
    }
    return { ok: true as const, status: updated?.status ?? "processing", documentId: doc.id };
  });

/* ==================== IMPORTAÇÃO DE XML DO FORNECEDOR ==================== */

export const importSupplierNfe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        vehicleId: z.string().uuid(),
        filename: z.string().max(200).optional(),
        xmlBase64: z.string().min(50).max(4_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const auto = await import("./fiscal/vehicle-fiscal.server");
    const svc = await import("./fiscal/service.server");

    const { data: vehicle } = await supabaseAdmin
      .from("vehicles")
      .select("*")
      .eq("id", data.vehicleId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!vehicle) throw new Error("Veículo não encontrado.");

    // parsing SEMPRE no backend
    const xml = Buffer.from(data.xmlBase64, "base64").toString("utf8");
    const parsed = auto.parseSupplierNfeXml(xml);

    const { data: dup } = await supabaseAdmin
      .from("fiscal_documents")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("source", "imported")
      .eq("access_key", parsed.accessKey)
      .maybeSingle();
    if (dup) return { ok: true, documentId: dup.id, duplicated: true, accessKey: parsed.accessKey };

    const cfg = await svc.loadConfig(supabaseAdmin, data.workspaceId);
    const ctx = await auto.resolveVehicleOperationContext(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicle,
      transactionType: "purchase",
    });

    const inserted = await supabaseAdmin
      .from("fiscal_documents")
      .insert({
        workspace_id: data.workspaceId,
        document_type: "NFE",
        environment: svc.configEnvironment(cfg),
        provider: cfg?.provider ?? "focus_nfe",
        vehicle_id: data.vehicleId,
        direction: "entry",
        issuer_type: "external",
        self_issued: false,
        source: "imported",
        operation_key: ctx.operationKey,
        status: "authorized",
        access_key: parsed.accessKey,
        number: parsed.number ?? null,
        series: parsed.series ?? null,
        issue_date: parsed.issueDate ?? null,
        total_amount: parsed.totalAmount ?? null,
        authorized_at: new Date().toISOString(),
        idempotency_key: `vehicle-entry-import:${data.workspaceId}:${parsed.accessKey}`,
        owner_user_id: context.userId,
        created_by: context.userId,
        supplier_snapshot: parsed.issuer,
        recipient_snapshot: parsed.recipient,
        items_snapshot: parsed.items,
        vehicle_snapshot: auto.buildVehicleSnapshot(vehicle),
        operation_snapshot: auto.buildOperationSnapshot(ctx, { imported: true }),
        tax_snapshot: {},
      } as any)
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const documentId = inserted.data.id as string;

    const path = `${data.workspaceId}/${documentId}.xml`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("fiscal-docs")
      .upload(path, new TextEncoder().encode(xml), { contentType: "application/xml", upsert: false });
    if (!upErr)
      await supabaseAdmin.from("fiscal_documents").update({ xml_storage_path: path }).eq("id", documentId);

    await auto.emitVehicleFiscalEvent(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicleId: data.vehicleId,
      documentId,
      actorUserId: context.userId,
      eventType: "vehicle.fiscal_entry_authorized",
      payload: { imported: true, access_key: parsed.accessKey, supplier: parsed.issuer.name ?? null },
    });

    return { ok: true, documentId, duplicated: false, accessKey: parsed.accessKey, parsed };
  });

/* ==================== TROCA (trade-in) ==================== */

export const registerTradeInVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        soldVehicleId: z.string().uuid(),
        leadId: z.string().uuid().nullable().optional(),
        appraisalAmount: z.number().positive(),
        vehicle: z.object({
          brand: z.string().min(1).max(60),
          model: z.string().min(1).max(80),
          version: z.string().max(120).optional(),
          year_manufacture: z.number().int().optional(),
          year_model: z.number().int().optional(),
          plate: z.string().max(10).optional(),
          chassis: z.string().max(30).optional(),
          renavam: z.string().max(20).optional(),
          color: z.string().max(40).optional(),
          mileage: z.number().int().optional(),
        }),
        seller: counterpartySchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ADMIN);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const auto = await import("./fiscal/vehicle-fiscal.server");

    const inserted = await supabaseAdmin
      .from("vehicles")
      .insert({
        workspace_id: data.workspaceId,
        ...data.vehicle,
        status: "available",
        acquisition_source: "trade_in",
        ownership_type: "owned",
        trade_in_for_vehicle_id: data.soldVehicleId,
        acquisition_details: {
          seller: data.seller ?? null,
          appraisal_amount: data.appraisalAmount,
          trade_in_for_vehicle_id: data.soldVehicleId,
          lead_id: data.leadId ?? null,
        },
        created_by: context.userId,
      } as any)
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const vehicleId = inserted.data.id as string;

    // Financeiro: custo de aquisição = valor da avaliação (não altera fórmulas existentes)
    await supabaseAdmin
      .from("vehicle_financials")
      .upsert(
        {
          vehicle_id: vehicleId,
          workspace_id: data.workspaceId,
          acquisition_cost: data.appraisalAmount,
          acquired_at: new Date().toISOString().slice(0, 10),
          created_by: context.userId,
        } as any,
        { onConflict: "vehicle_id" },
      );

    await auto.emitVehicleFiscalEvent(supabaseAdmin, {
      workspaceId: data.workspaceId,
      vehicleId,
      actorUserId: context.userId,
      eventType: "vehicle.acquired",
      payload: {
        acquisition_source: "trade_in",
        appraisal_amount: data.appraisalAmount,
        trade_in_for_vehicle_id: data.soldVehicleId,
      },
    });

    return { ok: true, vehicleId };
  });

/* ==================== OPERAÇÕES CONFIGURADAS ==================== */

export const getFiscalOperationsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, VIEWERS);
    const { data: rows, error } = await context.supabase
      .from("fiscal_profiles")
      .select("id, name, operation_key, direction, active, is_default, accountant_validated, cfop, cfop_interstate, ncm, valid_from, valid_to")
      .eq("workspace_id", data.workspaceId)
      .eq("active", true);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Homologação concluída por sentido — usado pelo Production Guard automotivo. */
export const getVehicleProductionReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, VIEWERS);
    const { data: rows, error } = await context.supabase
      .from("fiscal_documents")
      .select("direction, status, environment")
      .eq("workspace_id", data.workspaceId)
      .eq("environment", "homologation")
      .eq("status", "authorized");
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    return {
      homologation_entry_done: list.some((r: any) => r.direction === "entry"),
      homologation_exit_done: list.some((r: any) => r.direction === "exit"),
    };
  });
