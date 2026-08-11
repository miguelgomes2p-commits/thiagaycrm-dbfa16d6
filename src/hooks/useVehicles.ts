import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_MEDIA_BUCKET, type Vehicle, type VehicleMedia, type VehicleStatus } from "@/lib/vehicles";

export type VehicleFilters = {
  search?: string;
  status?: VehicleStatus | "all";
  brand?: string;
  model?: string;
  yearMin?: number | null;
  yearMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  mileageMax?: number | null;
};

export const VEHICLES_PAGE_SIZE = 24;

/** Consulta paginada e filtrada no banco (nunca no frontend). */
export function useVehicles(workspaceId: string | undefined, filters: VehicleFilters, page: number) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ["vehicles", workspaceId, filters, page],
    queryFn: async () => {
      let q = supabase
        .from("vehicles")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null);

      if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.brand) q = q.ilike("brand", `%${filters.brand}%`);
      if (filters.model) q = q.ilike("model", `%${filters.model}%`);
      if (filters.yearMin) q = q.gte("year_model", filters.yearMin);
      if (filters.yearMax) q = q.lte("year_model", filters.yearMax);
      if (filters.priceMin) q = q.gte("price", filters.priceMin);
      if (filters.priceMax) q = q.lte("price", filters.priceMax);
      if (filters.mileageMax) q = q.lte("mileage", filters.mileageMax);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, "");
        q = q.or(
          `brand.ilike.%${s}%,model.ilike.%${s}%,version.ilike.%${s}%,plate.ilike.%${s}%,stock_code.ilike.%${s}%`,
        );
      }

      const from = page * VEHICLES_PAGE_SIZE;
      const { data, error, count } = await q
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + VEHICLES_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Vehicle[], total: count ?? 0 };
    },
  });
}

/** Realtime: mantém cards abertos sincronizados quando o status muda. */
export function useVehiclesRealtime(workspaceId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`vehicles-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vehicles"] });
          qc.invalidateQueries({ queryKey: ["lead-vehicles"] });
          qc.invalidateQueries({ queryKey: ["vehicle-leads"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);
}

/** Fotos + URLs assinadas (bucket privado). */
export function useVehicleMedia(vehicleId: string | undefined) {
  return useQuery({
    enabled: !!vehicleId,
    queryKey: ["vehicle-media", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_media")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("is_cover", { ascending: false })
        .order("sort_order");
      if (error) throw error;
      const rows = (data ?? []) as unknown as VehicleMedia[];
      const urls = await Promise.all(
        rows.map(async (m) => {
          const { data: signed } = await supabase.storage
            .from(VEHICLE_MEDIA_BUCKET)
            .createSignedUrl(m.storage_path, 60 * 60 * 6);
          return { ...m, url: signed?.signedUrl ?? null };
        }),
      );
      return urls;
    },
  });
}

/** Capa de vários veículos em lote (grid do estoque). */
export function useVehicleCovers(vehicleIds: string[]) {
  const key = useMemo(() => [...vehicleIds].sort().join(","), [vehicleIds]);
  return useQuery({
    enabled: vehicleIds.length > 0,
    queryKey: ["vehicle-covers", key],
    queryFn: async () => {
      const { data } = await supabase
        .from("vehicle_media")
        .select("vehicle_id, storage_path, is_cover, sort_order")
        .in("vehicle_id", vehicleIds)
        .order("is_cover", { ascending: false })
        .order("sort_order");
      const first = new Map<string, string>();
      for (const row of data ?? []) {
        if (!first.has(row.vehicle_id)) first.set(row.vehicle_id, row.storage_path);
      }
      const out: Record<string, string> = {};
      await Promise.all(
        Array.from(first.entries()).map(async ([vid, path]) => {
          const { data: signed } = await supabase.storage
            .from(VEHICLE_MEDIA_BUCKET)
            .createSignedUrl(path, 60 * 60 * 6);
          if (signed?.signedUrl) out[vid] = signed.signedUrl;
        }),
      );
      return out;
    },
  });
}

export type LeadVehicleInterest = {
  id: string;
  lead_id: string;
  vehicle_id: string;
  interest_type: string;
  is_primary: boolean;
  status: string;
  notes: string | null;
  vehicles: Vehicle | null;
};

/** Veículos de interesse de um lead. */
export function useLeadVehicles(leadId: string | undefined) {
  return useQuery({
    enabled: !!leadId,
    queryKey: ["lead-vehicles", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_vehicle_interests")
        .select("id, lead_id, vehicle_id, interest_type, is_primary, status, notes, vehicles:vehicle_id(*)")
        .eq("lead_id", leadId!)
        .order("is_primary", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as LeadVehicleInterest[];
    },
  });
}

/** Leads interessados em um veículo. */
export function useVehicleLeads(vehicleId: string | undefined) {
  return useQuery({
    enabled: !!vehicleId,
    queryKey: ["vehicle-leads", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_vehicle_interests")
        .select("id, lead_id, is_primary, status, leads:lead_id(id, title, owner_id, stage_id, contacts:contact_id(name))")
        .eq("vehicle_id", vehicleId!)
        .eq("status", "active")
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; lead_id: string; is_primary: boolean; status: string;
        leads: { id: string; title: string; owner_id: string | null; stage_id: string; contacts: { name: string } | null } | null;
      }>;
    },
  });
}
