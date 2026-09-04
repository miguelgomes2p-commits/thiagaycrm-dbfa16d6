/* eslint-disable @typescript-eslint/no-explicit-any */
// Diagnóstico somente-leitura de um documento fiscal.
// NÃO emite, NÃO altera nada: apenas consulta a Focus (GET /v2/nfe/{ref}?completa=1)
// e devolve os dados já persistidos, sem tokens/credenciais.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFiscalRole } from "./fiscal/access";

const SECRET_KEY = /(token|senha|password|secret|authorization|certificad|pfx|apikey|api_key)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[...]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? "[REMOVIDO]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export type FiscalDocumentDiagnostics = {
  ref: string | null;
  environment: string;
  status: string;
  createdAt: string;
  rejectionCode: string | null;
  rejectionMessage: string | null;
  provider: {
    httpStatus: number | null;
    status?: string | undefined;
    errorCode?: string | undefined;
    errorMessage?: string | undefined;
    /** detalhamento bruto retornado pela Focus (sem credenciais) */
    raw: any;
    error?: string | undefined;
  };
  attempts: Array<Record<string, any>>;
  payload: Record<string, any>;
};

export const getFiscalDocumentDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workspaceId: z.string().uuid(), documentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<FiscalDocumentDiagnostics> => {
    await assertFiscalRole(context, data.workspaceId, ["owner", "admin", "manager"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const svc = await import("./fiscal/service.server");

    const { data: doc } = await supabaseAdmin
      .from("fiscal_documents")
      .select("*")
      .eq("id", data.documentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!doc) throw new Error("Documento fiscal não encontrado.");

    const { data: attempts } = await supabaseAdmin
      .from("fiscal_emission_attempts")
      .select("action, status, http_status, error_code, error_message, created_at")
      .eq("document_id", data.documentId)
      .order("created_at", { ascending: false })
      .limit(10);

    let provider: FiscalDocumentDiagnostics["provider"] = {
      httpStatus: null,
      raw: null,
      error: "Documento ainda não possui referência (ref) no provedor.",
    };
    const ref = (doc as any).provider_document_id as string | null;
    if (ref) {
      try {
        const { provider: p } = await svc.getProviderForWorkspace(supabaseAdmin, data.workspaceId);
        const res = await p.getNFe({ ref });
        provider = {
          httpStatus: res.httpStatus,
          status: res.status,
          errorCode: res.errorCode,
          errorMessage: res.errorMessage,
          raw: redact(res.raw),
        };
      } catch (e) {
        provider = {
          httpStatus: null,
          raw: null,
          error: e instanceof Error ? e.message : "Falha ao consultar o provedor.",
        };
      }
    }

    return {
      ref,
      environment: (doc as any).environment,
      status: (doc as any).status,
      createdAt: (doc as any).created_at,
      rejectionCode: (doc as any).rejection_code ?? null,
      rejectionMessage: (doc as any).rejection_message ?? null,
      provider,
      attempts: ((attempts ?? []) as any[]).map((a) => redact(a) as Record<string, any>),
      payload: redact({
        emitente: (doc as any).issuer_snapshot,
        destinatario: (doc as any).recipient_snapshot,
        fornecedor: (doc as any).supplier_snapshot,
        veiculo: (doc as any).vehicle_snapshot,
        operacao: (doc as any).operation_snapshot,
        itens: (doc as any).items_snapshot,
        tributacao: (doc as any).tax_snapshot,
        serie: (doc as any).series,
        valor_total: (doc as any).total_amount,
      }) as Record<string, any>,
    };
  });
