// Client-safe module. Server-only code lives in nfe.server.ts and is loaded
// inside handlers via dynamic import.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================================
// CONFIG: salvar credenciais + dados do emitente
// ============================================================================

export const setNfeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        environment: z.enum(["homologacao", "producao"]).optional(),
        tokenHomolog: z.string().optional(),
        tokenProd: z.string().optional(),
        cnpjEmitente: z.string().optional(),
        ieEmitente: z.string().optional(),
        regimeTributario: z.number().int().min(1).max(3).optional(),
        seriePadrao: z.number().int().min(1).max(999).optional(),
        cfopEntradaPadrao: z.string().optional(),
        cfopSaidaPadrao: z.string().optional(),
        naturezaOperacaoEntrada: z.string().optional(),
        naturezaOperacaoSaida: z.string().optional(),
        emitLogradouro: z.string().optional(),
        emitNumero: z.string().optional(),
        emitBairro: z.string().optional(),
        emitCep: z.string().optional(),
        emitMunicipio: z.string().optional(),
        emitIbge: z.string().optional(),
        emitUf: z.string().optional(),
        emitRazaoSocial: z.string().optional(),
        emitNomeFantasia: z.string().optional(),
        emitTelefone: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecret } = await import("./renave.server");

    const patch: Record<string, unknown> = {
      workspace_id: data.workspaceId,
      provider: "focus_nfe",
    };
    if (data.environment !== undefined) patch.environment = data.environment;
    if (data.tokenHomolog !== undefined)
      patch.token_homolog_enc = data.tokenHomolog ? encryptSecret(data.tokenHomolog) : null;
    if (data.tokenProd !== undefined)
      patch.token_prod_enc = data.tokenProd ? encryptSecret(data.tokenProd) : null;
    if (data.cnpjEmitente !== undefined) patch.cnpj_emitente = data.cnpjEmitente || null;
    if (data.ieEmitente !== undefined) patch.ie_emitente = data.ieEmitente || null;
    if (data.regimeTributario !== undefined) patch.regime_tributario = data.regimeTributario;
    if (data.seriePadrao !== undefined) patch.serie_padrao = data.seriePadrao;
    if (data.cfopEntradaPadrao !== undefined) patch.cfop_entrada_padrao = data.cfopEntradaPadrao;
    if (data.cfopSaidaPadrao !== undefined) patch.cfop_saida_padrao = data.cfopSaidaPadrao;
    if (data.naturezaOperacaoEntrada !== undefined)
      patch.natureza_operacao_entrada = data.naturezaOperacaoEntrada;
    if (data.naturezaOperacaoSaida !== undefined)
      patch.natureza_operacao_saida = data.naturezaOperacaoSaida;
    if (data.emitLogradouro !== undefined) patch.emit_logradouro = data.emitLogradouro || null;
    if (data.emitNumero !== undefined) patch.emit_numero = data.emitNumero || null;
    if (data.emitBairro !== undefined) patch.emit_bairro = data.emitBairro || null;
    if (data.emitCep !== undefined) patch.emit_cep = data.emitCep || null;
    if (data.emitMunicipio !== undefined) patch.emit_municipio = data.emitMunicipio || null;
    if (data.emitIbge !== undefined) patch.emit_ibge = data.emitIbge || null;
    if (data.emitUf !== undefined) patch.emit_uf = data.emitUf || null;
    if (data.emitRazaoSocial !== undefined) patch.emit_razao_social = data.emitRazaoSocial || null;
    if (data.emitNomeFantasia !== undefined)
      patch.emit_nome_fantasia = data.emitNomeFantasia || null;
    if (data.emitTelefone !== undefined) patch.emit_telefone = data.emitTelefone || null;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    // authz via RLS já garante que só owner/admin escreve
    void context;
    const { error } = await supabaseAdmin
      .from("nfe_config")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(patch as any, { onConflict: "workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// TESTAR CONEXÃO (chama /v2/empresas do Focus)
// ============================================================================

export const testNfeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { decryptSecret } = await import("./renave.server");
    const { focusRequest } = await import("./nfe.server");

    const { data: cfg, error } = await context.supabase
      .from("nfe_config")
      .select("environment, token_homolog_enc, token_prod_enc")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cfg) throw new Error("Configure a NF-e primeiro.");
    const env = (cfg.environment ?? "homologacao") as "homologacao" | "producao";
    const enc = env === "producao" ? cfg.token_prod_enc : cfg.token_homolog_enc;
    if (!enc) throw new Error(`Token do Focus NFe para ${env} não configurado.`);
    const token = decryptSecret(enc);
    const res = await focusRequest({ env, token, path: "/v2/empresas" });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      preview: JSON.stringify(res.body).slice(0, 400),
    };
  });

// ============================================================================
// EMITIR NF-e (entrada ou saída)
// ============================================================================

const contraparteSchema = z.object({
  tipo: z.enum(["PF", "PJ"]),
  nome: z.string().min(1),
  cpf: z.string().optional(),
  cnpj: z.string().optional(),
  ie: z.string().optional(),
  email: z.string().optional(),
  telefone: z.string().optional(),
  logradouro: z.string().min(1),
  numero: z.string().min(1),
  bairro: z.string().min(1),
  cep: z.string().min(1),
  municipio: z.string().min(1),
  ibge: z.string().min(1),
  uf: z.string().length(2),
});

export const emitNfe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        vehicleId: z.string().uuid(),
        direction: z.enum(["entrada", "saida"]),
        valor: z.number().positive(),
        contraparte: contraparteSchema,
        cfop: z.string().optional(),
        naturezaOperacao: z.string().optional(),
        informacoesAdicionais: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./renave.server");
    const { focusRequest, buildNfeEntradaPayload, buildNfeSaidaPayload } = await import(
      "./nfe.server"
    );

    // config
    const { data: cfg, error: cfgErr } = await context.supabase
      .from("nfe_config")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (cfgErr) throw new Error(cfgErr.message);
    if (!cfg) throw new Error("Configure a NF-e primeiro.");
    if (!cfg.is_active) throw new Error("Emissor NF-e desativado.");
    const env = (cfg.environment ?? "homologacao") as "homologacao" | "producao";
    const enc = env === "producao" ? cfg.token_prod_enc : cfg.token_homolog_enc;
    if (!enc) throw new Error(`Token Focus NFe (${env}) não configurado.`);
    const token = decryptSecret(enc);
    if (!cfg.cnpj_emitente) throw new Error("CNPJ do emitente não configurado.");

    // veículo
    const { data: veh, error: vErr } = await context.supabase
      .from("renave_vehicles")
      .select("id, chassi, renavam, placa, marca, modelo, ano_modelo, ano_fabricacao, cor, combustivel")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!veh) throw new Error("Veículo não encontrado.");

    const payload =
      data.direction === "entrada"
        ? buildNfeEntradaPayload({
            cfg,
            veiculo: veh,
            contraparte: data.contraparte,
            valor: data.valor,
            cfop: data.cfop,
            naturezaOperacao: data.naturezaOperacao,
            informacoesAdicionais: data.informacoesAdicionais,
          })
        : buildNfeSaidaPayload({
            cfg,
            veiculo: veh,
            contraparte: data.contraparte,
            valor: data.valor,
            cfop: data.cfop,
            naturezaOperacao: data.naturezaOperacao,
            informacoesAdicionais: data.informacoesAdicionais,
          });

    const ref = `${data.direction}-${data.vehicleId.slice(0, 8)}-${Date.now()}`;

    // grava doc pending
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("nfe_documents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        workspace_id: data.workspaceId,
        vehicle_id: data.vehicleId,
        direction: data.direction,
        environment: env,
        ref,
        focus_status: "processando",
        payload_request: payload,
        created_by: context.userId,
      } as any)
      .select("id")
      .single();
    if (docErr) throw new Error(docErr.message);

    // dispara emissão
    const res = await focusRequest({
      env,
      token,
      method: "POST",
      path: "/v2/nfe",
      query: { ref },
      body: payload,
    });

    // Focus retorna 202 (processando) ou 4xx (erro de validação síncrona)
    if (res.status >= 400) {
      const msg = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      await supabaseAdmin
        .from("nfe_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          focus_status: "erro",
          error_message: `HTTP ${res.status}: ${msg.slice(0, 400)}`,
          payload_response: res.body as any,
        })
        .eq("id", doc.id);
      throw new Error(`Focus NFe ${res.status}: ${msg.slice(0, 300)}`);
    }

    // consulta status logo em seguida (Focus geralmente autoriza em <5s em homologação)
    let final = res.body as {
      status?: string;
      chave_nfe?: string;
      numero?: string;
      serie?: string;
      caminho_xml_nota_fiscal?: string;
      caminho_danfe?: string;
      mensagem_sefaz?: string;
    };
    for (let i = 0; i < 3; i++) {
      if (final?.status && final.status !== "processando_autorizacao") break;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      const poll = await focusRequest({ env, token, path: `/v2/nfe/${ref}` });
      final = poll.body as typeof final;
    }

    const status =
      final?.status === "autorizado"
        ? "autorizado"
        : final?.status === "erro_autorizacao"
          ? "erro"
          : final?.status ?? "processando";

    await supabaseAdmin
      .from("nfe_documents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        focus_status: status,
        chave: final?.chave_nfe ?? null,
        numero: final?.numero ?? null,
        serie: final?.serie ?? null,
        xml_url: final?.caminho_xml_nota_fiscal
          ? `${env === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br"}${final.caminho_xml_nota_fiscal}`
          : null,
        pdf_url: final?.caminho_danfe
          ? `${env === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br"}${final.caminho_danfe}`
          : null,
        error_message: status === "erro" ? final?.mensagem_sefaz ?? null : null,
        payload_response: final as any,
      })
      .eq("id", doc.id);

    // amarra chave no veículo
    if (final?.chave_nfe && status === "autorizado") {
      const col = data.direction === "entrada" ? "nfe_entrada_chave" : "nfe_saida_chave";
      await supabaseAdmin
        .from("renave_vehicles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ [col]: final.chave_nfe } as any)
        .eq("id", data.vehicleId);
    }

    return {
      ok: status === "autorizado",
      docId: doc.id,
      ref,
      status,
      chave: final?.chave_nfe ?? null,
    };
  });

// ============================================================================
// RECONSULTAR STATUS
// ============================================================================

export const pollNfeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ docId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptSecret } = await import("./renave.server");
    const { focusRequest } = await import("./nfe.server");

    const { data: doc, error } = await context.supabase
      .from("nfe_documents")
      .select("id, workspace_id, vehicle_id, direction, ref, environment")
      .eq("id", data.docId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Nota não encontrada.");

    const { data: cfg } = await context.supabase
      .from("nfe_config")
      .select("token_homolog_enc, token_prod_enc")
      .eq("workspace_id", doc.workspace_id)
      .maybeSingle();
    if (!cfg) throw new Error("Config NF-e ausente.");
    const enc = doc.environment === "producao" ? cfg.token_prod_enc : cfg.token_homolog_enc;
    if (!enc) throw new Error("Token ausente.");
    const token = decryptSecret(enc);

    const env = doc.environment as "homologacao" | "producao";
    const poll = await focusRequest({ env, token, path: `/v2/nfe/${doc.ref}` });
    const final = poll.body as {
      status?: string;
      chave_nfe?: string;
      numero?: string;
      serie?: string;
      caminho_xml_nota_fiscal?: string;
      caminho_danfe?: string;
      mensagem_sefaz?: string;
    };
    const status = final?.status ?? "desconhecido";
    const base =
      env === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";

    await supabaseAdmin
      .from("nfe_documents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        focus_status: status,
        chave: final?.chave_nfe ?? null,
        numero: final?.numero ?? null,
        serie: final?.serie ?? null,
        xml_url: final?.caminho_xml_nota_fiscal ? `${base}${final.caminho_xml_nota_fiscal}` : null,
        pdf_url: final?.caminho_danfe ? `${base}${final.caminho_danfe}` : null,
        error_message: status === "erro_autorizacao" ? final?.mensagem_sefaz ?? null : null,
        payload_response: final as any,
      })
      .eq("id", doc.id);

    if (final?.chave_nfe && status === "autorizado" && doc.vehicle_id) {
      const col = doc.direction === "entrada" ? "nfe_entrada_chave" : "nfe_saida_chave";
      await supabaseAdmin
        .from("renave_vehicles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ [col]: final.chave_nfe } as any)
        .eq("id", doc.vehicle_id);
    }

    return { ok: true, status, chave: final?.chave_nfe ?? null };
  });
