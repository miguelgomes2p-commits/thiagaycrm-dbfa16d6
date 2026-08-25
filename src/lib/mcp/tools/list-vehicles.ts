import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_vehicles",
  title: "Listar veículos do estoque",
  description:
    "Lista o estoque de veículos visível para o usuário conectado (marca, modelo, ano, preço, km, placa e status). Filtre por texto e status.",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Workspace a consultar (use list_workspaces)."),
    search: z.string().trim().min(1).optional().describe("Busca por marca, modelo ou versão."),
    status: z
      .enum(["available", "reserved", "sold", "inactive"])
      .optional()
      .describe("Status do veículo no estoque."),
    limit: z.number().int().min(1).max(100).default(25).describe("Quantidade máxima de veículos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, search, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("vehicles")
      .select(
        "id, brand, model, version, year_manufacture, year_model, price, mileage, color, fuel, transmission, plate, stock_code, status, featured, created_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (workspace_id) query = query.eq("workspace_id", workspace_id);
    if (status) query = query.eq("status", status);
    if (search) {
      const term = search.replace(/[%,()]/g, " ");
      query = query.or(`brand.ilike.%${term}%,model.ilike.%${term}%,version.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, vehicles: data ?? [] });
  },
});
