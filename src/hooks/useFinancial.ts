import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addVehicleExpense, cancelVehicleExpense, getFinancialAccess, getFinancialOverview,
  getVehicleFinancial, saveVehicleFinancial,
} from "@/lib/financial.functions";
import type { FinancialOverview, VehicleExpense, VehicleFinancialRow } from "@/lib/financial";

/** Flag financial_management_beta — validada no servidor. */
export function useFinancialAccess() {
  const fn = useServerFn(getFinancialAccess);
  const q = useQuery({
    queryKey: ["financial-access"],
    queryFn: () => fn() as Promise<{ allowed: boolean }>,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { allowed: q.data?.allowed === true, isLoading: q.isLoading };
}

export type VehicleFinancialPayload = {
  financial: VehicleFinancialRow | null;
  expenses: VehicleExpense[];
  audit: Array<{
    id: string; entity: string; field: string; old_value: number | null; new_value: number | null;
    changed_by: string | null; created_at: string;
  }>;
};

export function useVehicleFinancial(vehicleId: string | undefined, enabled: boolean) {
  const fn = useServerFn(getVehicleFinancial);
  return useQuery({
    enabled: !!vehicleId && enabled,
    queryKey: ["vehicle-financial", vehicleId],
    queryFn: () => fn({ data: { vehicleId: vehicleId! } }) as Promise<VehicleFinancialPayload>,
    retry: false,
  });
}

function useInvalidateFinancial(vehicleId?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["vehicle-financial", vehicleId] });
    qc.invalidateQueries({ queryKey: ["financial-overview"] });
  };
}

export function useSaveVehicleFinancial(vehicleId?: string) {
  const fn = useServerFn(saveVehicleFinancial);
  const invalidate = useInvalidateFinancial(vehicleId);
  return useMutation({
    mutationFn: (input: Parameters<typeof saveVehicleFinancial>[0] extends never ? never : {
      vehicleId: string; acquisitionCost?: number | null; acquiredAt?: string | null;
      saleAmount?: number | null; saleDate?: string | null; soldToLeadId?: string | null;
    }) => fn({ data: input }),
    onSuccess: invalidate,
  });
}

export function useAddVehicleExpense(vehicleId?: string) {
  const fn = useServerFn(addVehicleExpense);
  const invalidate = useInvalidateFinancial(vehicleId);
  return useMutation({
    mutationFn: (input: {
      vehicleId: string; category: string; amount: number; expenseDate: string; description?: string | null;
    }) => fn({ data: input }),
    onSuccess: invalidate,
  });
}

export function useCancelVehicleExpense(vehicleId?: string) {
  const fn = useServerFn(cancelVehicleExpense);
  const invalidate = useInvalidateFinancial(vehicleId);
  return useMutation({
    mutationFn: (expenseId: string) => fn({ data: { expenseId } }),
    onSuccess: invalidate,
  });
}

export function useFinancialOverview(workspaceId: string | undefined, from: string, to: string, enabled: boolean) {
  const fn = useServerFn(getFinancialOverview);
  return useQuery({
    enabled: !!workspaceId && enabled,
    queryKey: ["financial-overview", workspaceId, from, to],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, from, to } }) as Promise<FinancialOverview>,
    retry: false,
  });
}
