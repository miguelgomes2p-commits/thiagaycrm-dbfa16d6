/**
 * Contrato neutro de consulta veicular.
 * Independe do fornecedor (DadosAPI hoje; SERPRO/outro no futuro).
 */

export type VehicleFipeInfo = {
  codigo: string | null;
  descricao: string | null;
  valor: number | null;
  mes_referencia: string | null;
};

export type VehicleLookupResult = {
  provider: string;
  fetched_at: string;
  plate: string;
  /** Campos que possuem correspondência direta no cadastro do estoque. */
  brand: string | null;
  model: string | null;
  version: string | null;
  year_manufacture: number | null;
  year_model: number | null;
  color: string | null;
  fuel: string | null;
  renavam: string | null;
  engine: string | null;
  category: string | null;
  /** Informações complementares (sem coluna dedicada hoje). */
  extra: {
    especie: string | null;
    tipo: string | null;
    carroceria: string | null;
    potencia: string | null;
    cilindrada: string | null;
    capacidade_passageiros: string | null;
    chassi_mascarado: string | null;
    motor_mascarado: string | null;
    eixos: string | null;
    peso_bruto_total: string | null;
    municipio: string | null;
    uf: string | null;
    situacao: string | null;
    ultimo_licenciamento: string | null;
    categoria: string | null;
    procedencia: string | null;
  };
  fipe: VehicleFipeInfo | null;
};

export type VehicleLookupResponse =
  | { ok: true; result: VehicleLookupResult }
  | { ok: false; code: "not_found" | "invalid_plate" | "unavailable" | "not_configured"; message: string };

/** Contrato de provider — permite trocar de fornecedor sem tocar na UI. */
export type BasicLookupProvider = {
  name: string;
  lookupByPlate(plate: string): Promise<VehicleLookupResponse>;
};

/* ------------------------------------------------------------------ */
/* Helpers de placa (isomórficos)                                      */
/* ------------------------------------------------------------------ */

export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

/** Aceita padrão antigo (AAA0000) e Mercosul (AAA0A00). */
export function isValidPlate(input: string): boolean {
  const p = normalizePlate(input);
  return /^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p);
}
