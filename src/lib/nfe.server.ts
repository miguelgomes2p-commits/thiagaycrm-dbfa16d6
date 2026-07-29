// Server-only helpers for Focus NFe integration. NEVER import this from
// client-reachable modules directly; load with dynamic import inside a
// server function/route handler.

export type NfeEnv = "homologacao" | "producao";

export function focusBaseUrl(env: NfeEnv): string {
  return env === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

export function focusAuthHeader(token: string): string {
  const basic = Buffer.from(`${token}:`).toString("base64");
  return `Basic ${basic}`;
}

export async function focusRequest(opts: {
  env: NfeEnv;
  token: string;
  path: string; // must start with '/'
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}): Promise<{ status: number; body: unknown; bodyText: string }> {
  const url = new URL(focusBaseUrl(opts.env) + opts.path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Authorization: focusAuthHeader(opts.token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const bodyText = await res.text();
  let parsed: unknown = bodyText;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    /* keep as text */
  }
  return { status: res.status, body: parsed, bodyText };
}

// -------------------- payload builders --------------------

export type EmitenteConfig = {
  cnpj_emitente: string | null;
  ie_emitente: string | null;
  regime_tributario: number | null;
  serie_padrao: number | null;
  cfop_entrada_padrao: string | null;
  cfop_saida_padrao: string | null;
  natureza_operacao_entrada: string | null;
  natureza_operacao_saida: string | null;
  emit_logradouro: string | null;
  emit_numero: string | null;
  emit_bairro: string | null;
  emit_cep: string | null;
  emit_municipio: string | null;
  emit_ibge: string | null;
  emit_uf: string | null;
  emit_razao_social: string | null;
  emit_nome_fantasia: string | null;
  emit_telefone: string | null;
};

export type VeiculoNfe = {
  chassi?: string | null;
  renavam?: string | null;
  placa?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano_modelo?: number | null;
  ano_fabricacao?: number | null;
  cor?: string | null;
  combustivel?: string | null;
};

export type Contraparte = {
  tipo: "PF" | "PJ";
  nome: string;
  cpf?: string;
  cnpj?: string;
  ie?: string; // "ISENTO" ou número
  email?: string;
  telefone?: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cep: string;
  municipio: string;
  ibge: string;
  uf: string;
};

function normalizeDoc(s?: string): string | undefined {
  return s ? s.replace(/\D+/g, "") : undefined;
}

function veiculoDescricao(v: VeiculoNfe): string {
  const parts = [
    v.marca,
    v.modelo,
    v.ano_modelo ? `Ano ${v.ano_modelo}` : null,
    v.cor,
  ].filter(Boolean);
  return parts.join(" ") || "Veículo automotor";
}

function veiculoInfoAdicional(v: VeiculoNfe): string {
  const lines: string[] = [];
  if (v.chassi) lines.push(`Chassi: ${v.chassi}`);
  if (v.renavam) lines.push(`RENAVAM: ${v.renavam}`);
  if (v.placa) lines.push(`Placa: ${v.placa}`);
  if (v.ano_fabricacao) lines.push(`Ano fab.: ${v.ano_fabricacao}`);
  if (v.combustivel) lines.push(`Combustível: ${v.combustivel}`);
  return lines.join(" | ");
}

function baseEmitente(cfg: EmitenteConfig) {
  return {
    cnpj_emitente: normalizeDoc(cfg.cnpj_emitente ?? ""),
    inscricao_estadual_emitente: cfg.ie_emitente ?? undefined,
    nome_emitente: cfg.emit_razao_social ?? undefined,
    nome_fantasia_emitente: cfg.emit_nome_fantasia ?? undefined,
    logradouro_emitente: cfg.emit_logradouro ?? undefined,
    numero_emitente: cfg.emit_numero ?? undefined,
    bairro_emitente: cfg.emit_bairro ?? undefined,
    municipio_emitente: cfg.emit_municipio ?? undefined,
    uf_emitente: cfg.emit_uf ?? undefined,
    cep_emitente: normalizeDoc(cfg.emit_cep ?? ""),
    telefone_emitente: normalizeDoc(cfg.emit_telefone ?? ""),
    codigo_municipio_emitente: cfg.emit_ibge ?? undefined,
    regime_tributario_emitente: cfg.regime_tributario ?? 1,
  };
}

function contraparteFields(prefix: "destinatario" | "destinatario", c: Contraparte) {
  const doc =
    c.tipo === "PF"
      ? { cpf_destinatario: normalizeDoc(c.cpf ?? "") }
      : {
          cnpj_destinatario: normalizeDoc(c.cnpj ?? ""),
          inscricao_estadual_destinatario: c.ie ?? "ISENTO",
        };
  return {
    nome_destinatario: c.nome,
    ...doc,
    email_destinatario: c.email ?? undefined,
    telefone_destinatario: normalizeDoc(c.telefone ?? ""),
    logradouro_destinatario: c.logradouro,
    numero_destinatario: c.numero,
    bairro_destinatario: c.bairro,
    municipio_destinatario: c.municipio,
    codigo_municipio_destinatario: c.ibge,
    uf_destinatario: c.uf,
    cep_destinatario: normalizeDoc(c.cep),
    indicador_inscricao_estadual_destinatario: c.tipo === "PF" ? 9 : 1,
    // sinaliza prefix to satisfy TS reference
    _prefix: prefix,
  } as Record<string, unknown>;
}

type BuildOpts = {
  cfg: EmitenteConfig;
  veiculo: VeiculoNfe;
  contraparte: Contraparte;
  valor: number; // valor unitário e total (qtd = 1)
  serie?: number;
  numero?: number; // opcional; Focus pode gerar
  naturezaOperacao?: string;
  cfop?: string;
  informacoesAdicionais?: string;
};

function baseItem(v: VeiculoNfe, valor: number, cfop: string) {
  return [
    {
      numero_item: 1,
      codigo_produto: v.chassi?.slice(-10) || "VEIC001",
      descricao: veiculoDescricao(v),
      cfop,
      unidade_comercial: "UN",
      quantidade_comercial: "1.0000",
      valor_unitario_comercial: valor.toFixed(2),
      valor_bruto: valor.toFixed(2),
      unidade_tributavel: "UN",
      quantidade_tributavel: "1.0000",
      valor_unitario_tributavel: valor.toFixed(2),
      codigo_ncm: "87032100", // veículos automotores; ajuste fino por modelo se necessário
      icms_origem: "0",
      icms_situacao_tributaria: "102", // Simples Nacional sem permissão de crédito (padrão seguro)
      pis_situacao_tributaria: "07",
      cofins_situacao_tributaria: "07",
      informacoes_adicionais_item: veiculoInfoAdicional(v),
    },
  ];
}

export function buildNfeEntradaPayload(o: BuildOpts) {
  const cfop = o.cfop ?? o.cfg.cfop_entrada_padrao ?? "1102";
  return {
    natureza_operacao: o.naturezaOperacao ?? o.cfg.natureza_operacao_entrada ?? "Compra para comercialização",
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    tipo_documento: 0, // 0 = entrada
    finalidade_emissao: 1, // 1 = normal
    presenca_comprador: 0,
    modalidade_frete: 9, // sem frete
    local_destino: 1,
    serie: o.serie ?? o.cfg.serie_padrao ?? 1,
    numero: o.numero,
    ...baseEmitente(o.cfg),
    ...contraparteFields("destinatario", o.contraparte),
    items: baseItem(o.veiculo, o.valor, cfop),
    valor_produtos: o.valor.toFixed(2),
    valor_total: o.valor.toFixed(2),
    informacoes_adicionais_contribuinte:
      o.informacoesAdicionais ??
      `Entrada de veículo. Chassi ${o.veiculo.chassi ?? "-"} RENAVAM ${o.veiculo.renavam ?? "-"}`,
  };
}

export function buildNfeSaidaPayload(o: BuildOpts) {
  const cfop = o.cfop ?? o.cfg.cfop_saida_padrao ?? "5102";
  return {
    natureza_operacao: o.naturezaOperacao ?? o.cfg.natureza_operacao_saida ?? "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    data_entrada_saida: new Date().toISOString(),
    tipo_documento: 1, // 1 = saída
    finalidade_emissao: 1,
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    serie: o.serie ?? o.cfg.serie_padrao ?? 1,
    numero: o.numero,
    ...baseEmitente(o.cfg),
    ...contraparteFields("destinatario", o.contraparte),
    items: baseItem(o.veiculo, o.valor, cfop),
    valor_produtos: o.valor.toFixed(2),
    valor_total: o.valor.toFixed(2),
    informacoes_adicionais_contribuinte:
      o.informacoesAdicionais ??
      `Venda de veículo. Chassi ${o.veiculo.chassi ?? "-"} RENAVAM ${o.veiculo.renavam ?? "-"}`,
  };
}
