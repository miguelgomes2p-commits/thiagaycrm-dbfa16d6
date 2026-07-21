import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPER_ADMIN_EMAIL = "miguelgomes2p@gmail.com";

function assertSuperAdmin(claims: Record<string, unknown> | undefined) {
  const email = (claims?.email as string | undefined)?.toLowerCase();
  if (email !== SUPER_ADMIN_EMAIL) {
    throw new Error("Forbidden: super admin only");
  }
}

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertSuperAdmin(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      full_name: (u.user_metadata?.full_name as string | undefined) ?? null,
    }));
  });

export const deleteUserById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as Record<string, unknown>);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir a própria conta por aqui.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAllWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertSuperAdmin(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: members } = await supabaseAdmin
      .from("workspace_members").select("workspace_id, user_id, role");
    const byWs = new Map<string, { count: number; roles: Record<string, number> }>();
    for (const m of members ?? []) {
      const cur = byWs.get(m.workspace_id) ?? { count: 0, roles: {} };
      cur.count++;
      cur.roles[m.role] = (cur.roles[m.role] ?? 0) + 1;
      byWs.set(m.workspace_id, cur);
    }
    return (workspaces ?? []).map((w) => ({
      ...w,
      member_count: byWs.get(w.id)?.count ?? 0,
      roles: byWs.get(w.id)?.roles ?? {},
    }));
  });

export const deleteWorkspaceById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspaces").delete().eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
