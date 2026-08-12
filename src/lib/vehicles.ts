/**
 * Domínio de Estoque de Veículos.
 * Formatadores pt-BR, rótulos de status e algoritmo determinístico de similares.
 * Toda a lógica fica aqui (fora da interface) para poder ser reaproveitada
 * pelo Automation Studio e por futuras importações (CSV/API).
 */
import { supabase } from "@/integrations/supabase/client";

export type VehicleStatus = "available" | "reserved" | "sold" | "inactive";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  inactive: "Inativo",
};

export const VEHICLE_STATUS_CLASS: Record<VehicleStatus, string> = {
  available: "bg-success/15 text-success",
  reserved: "bg-warning/20 text-warning",
  sold: "bg-destructive/15 text-destructive",
  inactive: "bg-muted text-muted-foreground",
};

export type Vehicle = {
  id: string;
  workspace_id: string;
  stock_code: string | null;
  brand: string;
  model: string;
  version: string | null;
  year_manufacture: number | null;
  year_model: number | null;
  mileage: number | null;
  price: number | null;
  plate: string | null;
  renavam: string | null;
  chassis: string | null;
  fuel: string | null;
  transmission: string | null;
  color: string | null;
  engine: string | null;
  category: string | null;
  description: string | null;
  status: VehicleStatus;
  featured: boolean;
  reserved_for_lead_id: string | null;
  sold_to_lead_id: string | null;
  reserved_at: string | null;
  sold_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VehicleMedia = {
  id: string;
  vehicle_id: string;
  workspace_id: string;
  storage_path: string;
  media_type: string;
  sort_order: number;
  is_cover: boolean;
};

export const VEHICLE_MEDIA_BUCKET = "vehicle-media";

export const FUEL_OPTIONS = ["Flex", "Gasolina", "Etanol", "Diesel", "Híbrido", "Elétrico", "GNV"];
export const TRANSMISSION_OPTIONS = ["Manual", "Automático", "Automatizado", "CVT"];

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("pt-BR")} km`;
}

export function formatYear(v: Pick<Vehicle, "year_manufacture" | "year_model">): string {
  if (v.year_manufacture && v.year_model) return `${v.year_manufacture}/${v.year_model}`;
  return String(v.year_model ?? v.year_manufacture ?? "—");
}

export function vehicleTitle(v: Pick<Vehicle, "brand" | "model" | "version">): string {
  return [v.brand, v.model, v.version].filter(Boolean).join(" ");
}

/** Parse "2019/2020" | "2020" -> { fab, mod } */
export function parseYearRange(input: string): { year_manufacture: number | null; year_model: number | null } {
  const nums = (input.match(/\d{4}/g) ?? []).map(Number);
  if (nums.length >= 2) return { year_manufacture: nums[0]!, year_model: nums[1]! };
  if (nums.length === 1) return { year_manufacture: nums[0]!, year_model: nums[0]! };
  return { year_manufacture: null, year_model: null };
}

/** Converte "89.990,00" | "89990" | "R$ 89.990,00" em número. */
export function parseBRLNumber(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Similaridade determinística (V1, sem IA)                            */
/* ------------------------------------------------------------------ */

export function scoreSimilarity(base: Vehicle, candidate: Vehicle): number {
  let score = 0;
  if (candidate.brand?.toLowerCase() === base.brand?.toLowerCase()) score += 40;
  if (candidate.model?.toLowerCase() === base.model?.toLowerCase()) score += 30;
  if (base.category && candidate.category && base.category === candidate.category) score += 8;
  if (base.transmission && candidate.transmission === base.transmission) score += 6;
  if (base.fuel && candidate.fuel === base.fuel) score += 6;
  if (base.price && candidate.price) {
    const diff = Math.abs(candidate.price - base.price) / base.price;
    if (diff <= 0.1) score += 20;
    else if (diff <= 0.2) score += 12;
    else if (diff <= 0.35) score += 5;
  }
  if (base.year_model && candidate.year_model) {
    const d = Math.abs(candidate.year_model - base.year_model);
    if (d === 0) score += 10;
    else if (d <= 1) score += 7;
    else if (d <= 3) score += 3;
  }
  return score;
}

/**
 * findSimilarVehicles — retorna apenas veículos DISPONÍVEIS do mesmo workspace,
 * ordenados por pontuação de similaridade.
 */
export async function findSimilarVehicles(vehicleId: string, limit = 5): Promise<Array<Vehicle & { score: number }>> {
  const { data: base, error } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
  if (error || !base) return [];
  const b = base as unknown as Vehicle;
  const { data: pool } = await supabase
    .from("vehicles")
    .select("*")
    .eq("workspace_id", b.workspace_id)
    .eq("status", "available")
    .is("deleted_at", null)
    .neq("id", b.id)
    .limit(200);
  return ((pool ?? []) as unknown as Vehicle[])
    .map((c) => ({ ...c, score: scoreSimilarity(b, c) }))
    .filter((c) => c.score >= 20)
    .sort((a, c) => c.score - a.score)
    .slice(0, limit);
}

/** Timeline: registra evento relevante no histórico do lead. */
export async function logLeadActivity(params: {
  workspaceId: string;
  leadId: string;
  type: string;
  title: string;
  content?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("activities").insert({
    workspace_id: params.workspaceId,
    lead_id: params.leadId,
    type: params.type,
    title: params.title,
    content: params.content ?? null,
    metadata: (params.metadata ?? {}) as never,
  });
}

/* ------------------------------------------------------------------ */
/* Ficha do veículo (texto para WhatsApp)                              */
/* ------------------------------------------------------------------ */

export function vehicleSpecText(v: Vehicle): string {
  const lines: string[] = [`*${vehicleTitle(v)}*`];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value !== "—") lines.push(`• ${label}: ${value}`);
  };
  add("Ano", formatYear(v));
  add("KM", formatKm(v.mileage));
  add("Cor", v.color);
  add("Câmbio", v.transmission);
  add("Combustível", v.fuel);
  add("Motor", v.engine);
  if (v.price != null) lines.push(`\n💰 *${formatBRL(v.price)}*`);
  if (v.description?.trim()) lines.push(`\n${v.description.trim()}`);
  return lines.join("\n");
}

/** Sobe uma foto para o bucket privado e cria o registro em vehicle_media. */
export async function uploadVehiclePhoto(params: {
  file: File;
  vehicleId: string;
  workspaceId: string;
  sortOrder: number;
  isCover: boolean;
}): Promise<{ error: string | null }> {
  const { file, vehicleId, workspaceId, sortOrder, isCover } = params;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${workspaceId}/${vehicleId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(VEHICLE_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) return { error: error.message };
  const { error: dberr } = await supabase.from("vehicle_media").insert({
    vehicle_id: vehicleId,
    workspace_id: workspaceId,
    storage_path: path,
    media_type: file.type.startsWith("video") ? "video" : "photo",
    sort_order: sortOrder,
    is_cover: isCover,
  } as never);
  return { error: dberr?.message ?? null };
}
