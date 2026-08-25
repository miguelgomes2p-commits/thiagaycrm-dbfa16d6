import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_conversations",
  title: "Listar conversas",
  description:
    "Lista as conversas de WhatsApp visíveis para o usuário conectado, com contato, canal, status, não lidas e prévia da última mensagem.",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Workspace a consultar (use list_workspaces)."),
    only_unread: z.boolean().default(false).describe("Retornar apenas conversas com mensagens não lidas."),
    limit: z.number().int().min(1).max(50).default(20).describe("Quantidade máxima de conversas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, only_unread, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("conversations")
      .select(
        "id, channel, status, assignment_status, unread_count, last_message_at, last_message_preview, ai_summary, contacts(id, name, phone)",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);
    if (workspace_id) query = query.eq("workspace_id", workspace_id);
    if (only_unread) query = query.gt("unread_count", 0);
    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({
      count: data?.length ?? 0,
      conversations: (data ?? []).map((c) => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        assignment_status: c.assignment_status,
        unread_count: c.unread_count,
        last_message_at: c.last_message_at,
        last_message_preview: c.last_message_preview,
        ai_summary: c.ai_summary,
        contact: c.contacts ? { id: c.contacts.id, name: c.contacts.name, phone: c.contacts.phone } : null,
      })),
    });
  },
});
