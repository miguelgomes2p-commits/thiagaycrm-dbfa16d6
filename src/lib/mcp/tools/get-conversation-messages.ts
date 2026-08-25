import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_conversation_messages",
  title: "Ler mensagens da conversa",
  description:
    "Retorna as mensagens mais recentes de uma conversa do Lupus CRM (direção, autor, conteúdo, tipo de mídia e status de entrega). Use list_conversations para obter o conversation_id.",
  inputSchema: {
    conversation_id: z.string().uuid().describe("ID da conversa."),
    limit: z.number().int().min(1).max(100).default(30).describe("Quantidade máxima de mensagens."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ conversation_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("messages")
      .select("id, direction, sender_type, content, media_type, delivery_status, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (error) return errorResult(error.message);
    const messages = (data ?? []).slice().reverse();
    return jsonResult({ conversation_id, count: messages.length, messages });
  },
});
