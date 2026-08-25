import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_contacts",
  title: "Listar contatos",
  description:
    "Lista ou busca contatos do Lupus CRM visíveis para o usuário conectado (nome, telefone, email, cidade, data de nascimento).",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Workspace a consultar (use list_workspaces)."),
    search: z.string().trim().min(1).optional().describe("Busca por nome, telefone ou email."),
    limit: z.number().int().min(1).max(100).default(25).describe("Quantidade máxima de contatos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("contacts")
      .select("id, name, phone, whatsapp, email, city, state, company_name, birthdate, tags, type, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (workspace_id) query = query.eq("workspace_id", workspace_id);
    if (search) {
      const term = search.replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, contacts: data ?? [] });
  },
});
