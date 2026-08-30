/**
 * Provider DadosAPI — consulta cadastral de veículo por placa.
 * Server-only: a API key nunca sai do backend.
 */
import type { BasicLookupProvider, VehicleLookupResponse, VehicleLookupResult } from "./types";

const ENDPOINT = "https://api.dadosapi.com/dados-publicos/consulta-veiculo-por-placa";
const TIMEOUT_MS = 12_000;

type Dict = Record<string, unknown>;

function pick(obj: Dict, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const clean = String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const FUEL_MAP: Array<[RegExp, string]> = [
  [/flex|alcool\s*\/\s*gasolina|bicomb/i, "Flex"],
  [/diesel/i, "Diesel"],
  [/h[ií]brid/i, "Híbrido"],
  [/el[ée]tric/i, "Elétrico"],
  [/gnv|g[áa]s/i, "GNV"],
  [/[áa]lcool|etanol/i, "Etanol"],
  [/gasolina/i, "Gasolina"],
];

/** Normaliza combustível da API para as opções do formulário (fallback: null). */
export function normalizeFuel(raw: string | null): string | null {
  if (!raw) return null;
  for (const [re, label] of FUEL_MAP) if (re.test(raw)) return label;
  return null;
}

function normalize(payload: Dict, plate: string): VehicleLookupResult {
  const root = (payload['dados'] as Dict) ?? (payload['data'] as Dict) ?? (payload['veiculo'] as Dict) ?? payload;
  const fipeRaw = (root['fipe'] as Dict) ?? (payload['fipe'] as Dict) ?? null;
  const cilindrada = str(pick(root, "cilindrada", "cilindradas"));

  return {
    provider: "dadosapi",
    fetched_at: new Date().toISOString(),
    plate,
    brand: str(pick(root, "marca", "brand")),
    model: str(pick(root, "modelo", "model")),
    version: str(pick(root, "versao", "version", "submodelo")),
    year_manufacture: num(pick(root, "anoFabricacao", "ano_fabricacao", "anoFab")),
    year_model: num(pick(root, "anoModelo", "ano_modelo", "ano")),
    color: str(pick(root, "cor", "color")),
    fuel: normalizeFuel(str(pick(root, "combustivel", "fuel"))),
    renavam: str(pick(root, "renavam")),
    engine: cilindrada ? (/cc/i.test(cilindrada) ? cilindrada : `${cilindrada} cc`) : null,
    category: str(pick(root, "carroceria", "especie", "tipo")),
    extra: {
      especie: str(pick(root, "especie")),
      tipo: str(pick(root, "tipo")),
      carroceria: str(pick(root, "carroceria")),
      potencia: str(pick(root, "potencia")),
      cilindrada,
      capacidade_passageiros: str(pick(root, "capacidadePassageiros", "capacidade_passageiros", "quantidadePassageiros")),
      chassi_mascarado: str(pick(root, "chassi", "chassiMascarado", "chassi_mascarado")),
      motor_mascarado: str(pick(root, "numeroMotor", "motor", "numero_motor")),
      eixos: str(pick(root, "quantidadeEixos", "eixos", "quantidade_eixos")),
      peso_bruto_total: str(pick(root, "pesoBrutoTotal", "peso_bruto_total", "pbt")),
      municipio: str(pick(root, "municipio", "cidade")),
      uf: str(pick(root, "uf", "estado")),
      situacao: str(pick(root, "situacao", "situacaoVeiculo", "situacao_veiculo")),
      ultimo_licenciamento: str(pick(root, "dataUltimoLicenciamento", "ultimoLicenciamento", "data_ultimo_licenciamento")),
      categoria: str(pick(root, "categoria")),
      procedencia: str(pick(root, "procedencia")),
    },
    fipe: fipeRaw
      ? {
          codigo: str(pick(fipeRaw, "codigo", "codigoFipe", "code")),
          descricao: str(pick(fipeRaw, "descricao", "modelo", "description")),
          valor: num(pick(fipeRaw, "valor", "preco", "value")),
          mes_referencia: str(pick(fipeRaw, "mesReferencia", "mes_referencia", "referencia")),
        }
      : null,
  };
}

export const dadosApiProvider: BasicLookupProvider = {
  name: "dadosapi",
  async lookupByPlate(plate: string): Promise<VehicleLookupResponse> {
    const apiKey = process.env['DADOSAPI_API_KEY'];
    if (!apiKey) {
      return { ok: false, code: "not_configured", message: "Consulta por placa ainda não está configurada." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ placa: plate }),
        signal: controller.signal,
      });

      if (res.status === 404) {
        return { ok: false, code: "not_found", message: "Placa não encontrada." };
      }
      if (!res.ok) {
        console.error("[dadosapi] falha na consulta", res.status);
        return { ok: false, code: "unavailable", message: "Serviço de consulta indisponível." };
      }

      const json = (await res.json()) as Dict;
      const result = normalize(json, plate);
      if (!result.brand && !result.model && !result.renavam) {
        return { ok: false, code: "not_found", message: "Placa não encontrada." };
      }
      return { ok: true, result };
    } catch (err) {
      console.error("[dadosapi] erro", err instanceof Error ? err.message : err);
      return { ok: false, code: "unavailable", message: "Serviço de consulta indisponível." };
    } finally {
      clearTimeout(timer);
    }
  },
};
