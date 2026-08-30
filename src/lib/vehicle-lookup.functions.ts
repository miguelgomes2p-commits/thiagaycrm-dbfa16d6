import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidPlate, normalizePlate, type VehicleLookupResponse } from "@/lib/vehicle-lookup/types";

/**
 * Consulta cadastral de veículo por placa.
 * Autenticada e escopada ao workspace do usuário — a API key fica só no servidor.
 */
export const lookupVehicleByPlate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { plate: string; workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<VehicleLookupResponse> => {
    const plate = normalizePlate(data.plate ?? "");
    if (!isValidPlate(plate)) {
      return { ok: false, code: "invalid_plate", message: "Placa inválida." };
    }

    // Multi-tenant: só membros do workspace podem consultar (RLS valida o acesso).
    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .select("id")
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (error || !ws) {
      return { ok: false, code: "unavailable", message: "Workspace não encontrado." };
    }

    const { dadosApiProvider } = await import("@/lib/vehicle-lookup/dadosapi.server");
    return dadosApiProvider.lookupByPlate(plate);
  });
