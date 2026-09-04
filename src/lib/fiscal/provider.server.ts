// Abstração de provedor fiscal. O CRM nunca fala SOAP/SEFAZ diretamente:
// FiscalService -> FiscalProvider -> (FocusNFeProvider | NuvemFiscalProvider).
// SERVER-ONLY: importe apenas de dentro de handlers.

import { focusAuthHeader, focusRequest, type NfeEnv } from "../nfe.server";
import type { FiscalEnvironment } from "./types";

export type ProviderResult = {
  ok: boolean;
  httpStatus: number;
  /** status normalizado do documento, quando o provider informa */
  status?: string;
  raw: unknown;
  errorCode?: string;
  errorMessage?: string;
  number?: string;
  series?: string;
  accessKey?: string;
  protocol?: string;
  xmlUrl?: string;
  danfeUrl?: string;
};

export type CompanyLookupResult = {
  ok: boolean;
  httpStatus: number;
  endpoint: string;
  company: Record<string, unknown> | null;
  errorCode?: string;
  errorMessage?: string;
};

export interface FiscalProvider {
  readonly name: string;
  issueNFe(input: { ref: string; payload: unknown }): Promise<ProviderResult>;
  getNFe(input: { ref: string }): Promise<ProviderResult>;
  cancelNFe(input: { ref: string; reason: string }): Promise<ProviderResult>;
  downloadFile(url: string): Promise<{ ok: boolean; bytes?: ArrayBuffer; contentType?: string }>;
  registerCompany?(input: {
    cnpj: string;
    razaoSocial: string;
    certificateBase64: string;
    certificatePassword: string;
    extra?: Record<string, unknown>;
  }): Promise<ProviderResult & { companyId?: string; certificateExpiresAt?: string | null }>;
  /** API administrativa de empresas — sempre no domínio de produção da Focus. */
  findCompanyByCnpj?(input: { cnpj: string; token: string }): Promise<CompanyLookupResult>;
  getStatus(): Promise<ProviderResult>;
}

/**
 * A API administrativa de empresas da Focus NFe existe apenas no domínio de
 * produção — o ambiente de EMISSÃO (homologação/produção) não muda esta URL.
 */
export const FOCUS_ADMIN_BASE_URL = "https://api.focusnfe.com.br";


function envToFocus(env: FiscalEnvironment): NfeEnv {
  return env === "production" ? "producao" : "homologacao";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Mapeia status do Focus NFe para o status interno do CRM. */
export function mapFocusStatus(focusStatus: string | undefined): string {
  switch (focusStatus) {
    case "autorizado":
      return "authorized";
    case "cancelado":
      return "cancelled";
    case "erro_autorizacao":
    case "denegado":
      return "rejected";
    case "processando_autorizacao":
      return "processing";
    default:
      return focusStatus ? "processing" : "pending";
  }
}

export class FocusNFeProvider implements FiscalProvider {
  readonly name = "focus_nfe";
  private env: NfeEnv;
  private token: string;

  constructor(opts: { environment: FiscalEnvironment; token: string }) {
    this.env = envToFocus(opts.environment);
    this.token = opts.token;
  }

  private base(): string {
    return this.env === "producao"
      ? "https://api.focusnfe.com.br"
      : "https://homologacao.focusnfe.com.br";
  }

  private normalize(res: { status: number; body: unknown }): ProviderResult {
    const b = asRecord(res.body);
    const focusStatus = str(b.status);
    const xmlPath = str(b.caminho_xml_nota_fiscal);
    const danfePath = str(b.caminho_danfe);
    const isHttpOk = res.status >= 200 && res.status < 300;
    const errorCode = str(b.codigo) ?? str(b.status_sefaz);
    const errorMessage = str(b.mensagem_sefaz) ?? str(b.mensagem) ?? str(b.erros as string);
    return {
      ok: isHttpOk,
      httpStatus: res.status,
      status: focusStatus,
      raw: res.body,
      ...(errorCode ? { errorCode } : {}),
      ...(errorMessage ? { errorMessage } : {}),
      ...(str(b.numero) ? { number: str(b.numero)! } : {}),
      ...(str(b.serie) ? { series: str(b.serie)! } : {}),
      ...(str(b.chave_nfe) ? { accessKey: str(b.chave_nfe)! } : {}),
      ...(str(b.protocolo) ? { protocol: str(b.protocolo)! } : {}),
      ...(xmlPath ? { xmlUrl: `${this.base()}${xmlPath}` } : {}),
      ...(danfePath ? { danfeUrl: `${this.base()}${danfePath}` } : {}),
    };
  }

  async issueNFe({ ref, payload }: { ref: string; payload: unknown }) {
    const res = await focusRequest({
      env: this.env,
      token: this.token,
      method: "POST",
      path: "/v2/nfe",
      query: { ref },
      body: payload,
    });
    return this.normalize(res);
  }

  async getNFe({ ref }: { ref: string }) {
    const res = await focusRequest({
      env: this.env,
      token: this.token,
      path: `/v2/nfe/${encodeURIComponent(ref)}`,
      query: { completa: "1" },
    });
    return this.normalize(res);
  }

  async cancelNFe({ ref, reason }: { ref: string; reason: string }) {
    const res = await focusRequest({
      env: this.env,
      token: this.token,
      method: "DELETE",
      path: `/v2/nfe/${encodeURIComponent(ref)}`,
      body: { justificativa: reason },
    });
    return this.normalize(res);
  }

  async downloadFile(url: string) {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${this.token}:`).toString("base64")}` },
    });
    if (!res.ok) return { ok: false };
    return {
      ok: true,
      bytes: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async registerCompany(input: {
    cnpj: string;
    razaoSocial: string;
    certificateBase64: string;
    certificatePassword: string;
    extra?: Record<string, unknown>;
  }) {
    // O Focus custodia o certificado A1 — o CRM nunca persiste o arquivo/senha.
    const res = await focusRequest({
      env: this.env,
      token: this.token,
      method: "POST",
      path: "/v2/empresas",
      body: {
        cnpj: input.cnpj,
        nome: input.razaoSocial,
        nome_fantasia: input.razaoSocial,
        arquivo_certificado_base64: input.certificateBase64,
        senha_certificado: input.certificatePassword,
        habilita_nfe: true,
        ...(input.extra ?? {}),
      },
    });
    const b = asRecord(res.body);
    const out = this.normalize(res);
    return {
      ...out,
      ...(str(b.id) || typeof b.id === "number" ? { companyId: String(b.id) } : {}),
      certificateExpiresAt: str(b.certificado_valido_ate) ?? null,
    };
  }

  async getStatus() {
    const res = await focusRequest({ env: this.env, token: this.token, path: "/v2/empresas" });
    return this.normalize(res);
  }
}

export function createFiscalProvider(opts: {
  provider: string;
  environment: FiscalEnvironment;
  token: string;
}): FiscalProvider {
  switch (opts.provider) {
    case "focus_nfe":
    default:
      return new FocusNFeProvider({ environment: opts.environment, token: opts.token });
  }
}
