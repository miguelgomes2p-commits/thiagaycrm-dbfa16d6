import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista os leads do pipeline visíveis para o usuário conectado, com etapa, valor, prioridade e contato. Filtre por workspace, texto no título ou nome da etapa.",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Workspace a consultar (use list_workspaces)."),
    search: z.string().trim().min(1).optional().describe("Texto para buscar no título do lead."),
    stage_name: z.string().trim().min(1).optional().describe("Nome da etapa do pipeline (ex.: Negociação)."),
    limit: z.number().int().min(1).max(100).default(25).describe("Quantidade máxima de leads."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, search, stage_name, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("leads")
      .select(
        "id, title, value, currency, priority, source, notes, created_at, last_interaction_at, won_at, lost_at, pipeline_stages(name), contacts(id, name, phone, city)",
      )
      .is("deleted_at", null)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 25);
    if (workspace_id) query = query.eq("workspace_id", workspace_id);
    if (search) query = query.ilike("title", `%${search}%`);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    let items = data ?? [];
    if (stage_name) {
      const needle = stage_name.toLowerCase();
      items = items.filter((l) => (l.pipeline_stages?.name ?? "").toLowerCase().includes(needle));
    }
    return jsonResult({
      count: items.length,
      leads: items.map((l) => ({
        id: l.id,
        title: l.title,
        stage: l.pipeline_stages?.name ?? null,
        value: l.value,
        currency: l.currency,
        priority: l.priority,
        source: l.source,
        notes: l.notes,
        status: l.won_at ? "ganho" : l.lost_at ? "perdido" : "aberto",
        created_at: l.created_at,
        last_interaction_at: l.last_interaction_at,
        contact: l.contacts
          ? { id: l.contacts.id, name: l.contacts.name, phone: l.contacts.phone, city: l.contacts.city }
          : null,
      })),
    });
  },
});
