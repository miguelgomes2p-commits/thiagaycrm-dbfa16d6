import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Criar tarefa",
  description:
    "Cria uma tarefa no Lupus CRM para o usuário conectado, opcionalmente vinculada a um lead ou contato. Use list_workspaces para obter o workspace_id.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace onde a tarefa será criada."),
    title: z.string().trim().min(1).max(200).describe("Título da tarefa."),
    description: z.string().trim().max(2000).optional().describe("Detalhes da tarefa."),
    due_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Prazo em ISO 8601 com fuso, ex.: 2026-09-01T13:00:00-03:00."),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium").describe("Prioridade da tarefa."),
    lead_id: z.string().uuid().optional().describe("Lead relacionado (opcional)."),
    contact_id: z.string().uuid().optional().describe("Contato relacionado (opcional)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const userId = ctx.getUserId();
    if (!userId) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        workspace_id: input.workspace_id,
        title: input.title,
        description: input.description ?? null,
        due_at: input.due_at ?? null,
        priority: input.priority ?? "medium",
        lead_id: input.lead_id ?? null,
        contact_id: input.contact_id ?? null,
        assigned_to: userId,
        created_by: userId,
      })
      .select("id, title, due_at, priority, done")
      .single();
    if (error) return errorResult(error.message);
    return jsonResult({ task: data });
  },
});
