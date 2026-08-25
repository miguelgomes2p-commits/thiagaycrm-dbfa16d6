import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "Listar tarefas",
  description:
    "Lista as tarefas do Lupus CRM visíveis para o usuário conectado, com título, prazo, prioridade e lead relacionado.",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Workspace a consultar (use list_workspaces)."),
    only_pending: z.boolean().default(true).describe("Retornar apenas tarefas não concluídas."),
    limit: z.number().int().min(1).max(100).default(25).describe("Quantidade máxima de tarefas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, only_pending, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("tasks")
      .select("id, title, description, done, due_at, priority, created_at, leads(id, title)")
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(limit ?? 25);
    if (workspace_id) query = query.eq("workspace_id", workspace_id);
    if (only_pending !== false) query = query.eq("done", false);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({
      count: data?.length ?? 0,
      tasks: (data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        done: t.done,
        due_at: t.due_at,
        priority: t.priority,
        created_at: t.created_at,
        lead: t.leads ? { id: t.leads.id, title: t.leads.title } : null,
      })),
    });
  },
});
