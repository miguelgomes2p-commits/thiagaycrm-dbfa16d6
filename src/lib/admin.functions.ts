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
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: memberships } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id, role, workspaces:workspace_id(id, name)");
    const byUser = new Map<string, { id: string; name: string; role: string }[]>();
    for (const m of memberships ?? []) {
      const w = m.workspaces as unknown as { id: string; name: string } | null;
      if (!w) continue;
      const list = byUser.get(m.user_id) ?? [];
      list.push({ id: w.id, name: w.name, role: m.role });
      byUser.set(m.user_id, list);
    }
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      full_name: (u.user_metadata?.full_name as string | undefined) ?? null,
      workspaces: byUser.get(u.id) ?? [],
    }));
  });


export const deleteUserById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
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
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, slug, created_at, feature_renave, feature_ai")
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
      joined: (members ?? []).some((m) => m.workspace_id === w.id && m.user_id === context.userId),
    }));
  });

export const updateWorkspaceFeatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; feature_renave?: boolean; feature_ai?: boolean }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
    const patch: { feature_renave?: boolean; feature_ai?: boolean } = {};
    if (typeof data.feature_renave === "boolean") patch.feature_renave = data.feature_renave;
    if (typeof data.feature_ai === "boolean") patch.feature_ai = data.feature_ai;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspaces").update(patch).eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteWorkspaceById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspaces").delete().eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Dá ao super admin acesso total a qualquer workspace, criando (se preciso)
 * uma associação com papel `owner`. As RLS já liberam tudo para owners.
 */
export const joinWorkspaceAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin
        .from("workspace_members")
        .insert({ workspace_id: data.workspaceId, user_id: context.userId, role: "owner" });
      if (error) throw new Error(error.message);
    } else if (existing.role !== "owner") {
      const { error } = await supabaseAdmin
        .from("workspace_members").update({ role: "owner" }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, workspaceId: data.workspaceId };
  });

/** Remove o acesso do super admin a um workspace (sai da lista dele). */
export const leaveWorkspaceAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    assertSuperAdmin(context.claims as unknown as Record<string, unknown>);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ws } = await supabaseAdmin
      .from("workspaces").select("created_by").eq("id", data.workspaceId).maybeSingle();
    if (ws && (ws as { created_by?: string | null }).created_by === context.userId) {
      throw new Error("Você é o criador deste workspace — não é possível sair.");
    }
    const { error } = await supabaseAdmin
      .from("workspace_members")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

