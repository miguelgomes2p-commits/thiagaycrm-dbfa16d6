import { createFileRoute } from "@tanstack/react-router";

// Webhook do Focus NFe. Focus manda POST simples ao autorizar/rejeitar.
// Autenticação: header x-focus-token (configurado no painel do Focus com
// o valor de FOCUS_NFE_WEBHOOK_TOKEN).

export const Route = createFileRoute("/api/public/webhooks/focus-nfe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.FOCUS_NFE_WEBHOOK_TOKEN;
        if (!expected) return new Response("misconfigured", { status: 500 });
        const got = request.headers.get("x-focus-token") ?? request.headers.get("authorization");
        if (!got || !got.includes(expected)) {
          return new Response("unauthorized", { status: 401 });
        }

        const bodyText = await request.text();
        let payload: {
          ref?: string;
          status?: string;
          chave_nfe?: string;
          numero?: string;
          serie?: string;
          caminho_xml_nota_fiscal?: string;
          caminho_danfe?: string;
          mensagem_sefaz?: string;
        } = {};
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        if (!payload.ref) return new Response("missing ref", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Novo módulo Fiscal (fiscal_documents) — atualização assíncrona idempotente.
        const { data: fiscalDoc } = await supabaseAdmin
          .from("fiscal_documents")
          .select("id, workspace_id, status")
          .eq("provider_document_id", payload.ref)
          .maybeSingle();
        if (fiscalDoc) {
          const svc = await import("@/lib/fiscal/service.server");
          const { provider } = await svc.getProviderForWorkspace(supabaseAdmin, fiscalDoc.workspace_id);
          // Não confiamos apenas no payload: reconsultamos o provedor.
          const res = await provider.getNFe({ ref: payload.ref });
          await svc.applyProviderResult(supabaseAdmin, provider, fiscalDoc.id, res);
          return new Response("ok");
        }

        const { data: doc } = await supabaseAdmin
          .from("nfe_documents")
          .select("id, workspace_id, vehicle_id, direction, environment")
          .eq("ref", payload.ref)
          .maybeSingle();
        if (!doc) return new Response("ref not found", { status: 404 });


        const base =
          doc.environment === "producao"
            ? "https://api.focusnfe.com.br"
            : "https://homologacao.focusnfe.com.br";

        const status = payload.status ?? "desconhecido";

        await supabaseAdmin
          .from("nfe_documents")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({
            focus_status: status,
            chave: payload.chave_nfe ?? null,
            numero: payload.numero ?? null,
            serie: payload.serie ?? null,
            xml_url: payload.caminho_xml_nota_fiscal
              ? `${base}${payload.caminho_xml_nota_fiscal}`
              : null,
            pdf_url: payload.caminho_danfe ? `${base}${payload.caminho_danfe}` : null,
            error_message:
              status === "erro_autorizacao" ? payload.mensagem_sefaz ?? null : null,
            payload_response: payload as any,
          })
          .eq("id", doc.id);

        if (payload.chave_nfe && status === "autorizado" && doc.vehicle_id) {
          const col = doc.direction === "entrada" ? "nfe_entrada_chave" : "nfe_saida_chave";
          await supabaseAdmin
            .from("renave_vehicles")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ [col]: payload.chave_nfe } as any)
            .eq("id", doc.vehicle_id);
        }

        return new Response("ok");
      },
    },
  },
});
