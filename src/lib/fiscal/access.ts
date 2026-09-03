/* eslint-disable @typescript-eslint/no-explicit-any */
// Checagem de permissão fiscal. Admin global e suporte da plataforma têm acesso
// total, mesmo sem linha em workspace_members do workspace consultado.

const SUPER_ADMIN_EMAIL = "miguelgomes2p@gmail.com";

export async function assertFiscalRole(ctx: any, workspaceId: string, roles: string[]) {
  const email = String(ctx?.user?.email ?? ctx?.claims?.email ?? "").toLowerCase();
  if (email && email === SUPER_ADMIN_EMAIL) return "owner";

  const { data: rows } = await ctx.supabase
    .from("workspace_members")
    .select("role,user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", ctx.userId);
  const role = rows?.[0]?.role as string | undefined;
  if (role && roles.includes(role)) return role;

  const { data: isSupport } = await ctx.supabase.rpc("is_support_staff", { _user_id: ctx.userId });
  if (isSupport === true) return "support";

  throw new Error("Sem permissão fiscal para esta ação.");
}
