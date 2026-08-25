import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_workspaces",
  title: "Listar workspaces",
  description:
    "Lista os workspaces do Lupus CRM que o usuário conectado pode acessar, com id, nome, modo e o papel do usuário. Use o id retornado como workspace_id nas outras ferramentas.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces(id, name, slug, workspace_mode)")
      .eq("user_id", ctx.getUserId() ?? "");
    if (error) return errorResult(error.message);
    const items = (data ?? []).map((row) => ({
      id: row.workspaces?.id,
      name: row.workspaces?.name,
      slug: row.workspaces?.slug,
      mode: row.workspaces?.workspace_mode,
      my_role: row.role,
    }));
    return jsonResult({ count: items.length, workspaces: items });
  },
});
