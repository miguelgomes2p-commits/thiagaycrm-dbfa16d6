import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Locais comerciais do workspace (lojas / unidades / pátios).
 * Leitura: qualquer membro. Escrita: apenas owner/admin/manager/support
 * (garantido por RLS na tabela `workspace_locations`).
 */

export type WorkspaceLocation = {
  id: string;
  workspace_id: string;
  name: string;
  address: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  is_default: boolean;
  is_active: boolean;
};

const locationInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(400).optional().nullable(),
  street: z.string().trim().max(200).optional().nullable(),
  number: z.string().trim().max(30).optional().nullable(),
  complement: z.string().trim().max(120).optional().nullable(),
  neighborhood: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(60).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const listLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("workspace_locations")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as WorkspaceLocation[];
  });

export const createLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => locationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("workspace_locations")
      .insert({ workspace_id: workspaceId, created_by: context.userId, ...rest })
      .select()
      .single();
    if (error) throw new Error(error.message);
    console.info("location_created", {
      workspace_id: workspaceId,
      location_id: row.id,
      user_id: context.userId,
      is_default: row.is_default,
    });
    return row as unknown as WorkspaceLocation;
  });

export const updateLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    locationInput.partial().extend({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, workspaceId, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("workspace_locations")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    console.info(rest.is_default ? "default_location_changed" : "location_updated", {
      workspace_id: workspaceId,
      location_id: id,
      user_id: context.userId,
    });
    return row as unknown as WorkspaceLocation;
  });

export const deleteLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_locations")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Geocodifica um endereço livre usando o Nominatim (OpenStreetMap), que já é
 * o serviço de mapas usado no preview do card de localização — sem chave.
 */
export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().trim().min(4).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(data.query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "LupusCRM/1.0 (workspace-locations)", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Falha ao buscar endereço (${res.status})`);
    const json = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
      address?: Record<string, string>;
    }>;
    return json.map((r) => {
      const a = r.address ?? {};
      return {
        latitude: Number(Number(r.lat).toFixed(6)),
        longitude: Number(Number(r.lon).toFixed(6)),
        display_name: r.display_name ?? "",
        street: a["road"] ?? null,
        number: a["house_number"] ?? null,
        neighborhood: a["suburb"] ?? a["neighbourhood"] ?? null,
        city: a["city"] ?? a["town"] ?? a["village"] ?? a["municipality"] ?? null,
        state: a["state"] ?? null,
        postal_code: a["postcode"] ?? null,
        country: a["country_code"] ? a["country_code"].toUpperCase() : null,
      };
    });
  });
