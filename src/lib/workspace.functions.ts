import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "owner" | "admin" | "manager" | "agent";
const ROLES: Role[] = ["owner", "admin", "manager", "agent"];

async function assertAdmin(supabase: any, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new Error("Apenas owner/admin do workspace pode gerenciar membros.");
  }
}

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Email inválido.");
  return value;
}

async function hashInviteToken(token: string) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(token).digest("hex");
}

async function getOrigin() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const urlOrigin = req ? new URL(req.url).origin : "";
  const host = req?.headers.get("x-forwarded-host") ?? req?.headers.get("host");
  const proto = req?.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : urlOrigin;
}

export const listWorkspaceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase
      .from("workspace_members")
      .select("user_id, role, created_at")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    if (!members || members.length === 0) return [];
    const ids = members.map((m: any) => m.user_id);
    const { data: profs } = await context.supabase
      .from("profiles").select("id, full_name").in("id", ids);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = new Map<string, string | null>();
    for (const id of ids) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        emails.set(id, u.user?.email ?? null);
      } catch { emails.set(id, null); }
    }
    return members.map((m: any) => ({
      user_id: m.user_id, role: m.role, created_at: m.created_at,
      full_name: (profs ?? []).find((p: any) => p.id === m.user_id)?.full_name ?? null,
      email: emails.get(m.user_id) ?? null,
    }));
  });

export const addMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; email: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!ROLES.includes(data.role)) throw new Error("Papel inválido.");
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // find user by email (paginated search)
    const emailLower = data.email.trim().toLowerCase();
    let foundId: string | null = null;
    for (let page = 1; page <= 5 && !foundId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const u = list.users.find((x) => (x.email ?? "").toLowerCase() === emailLower);
      if (u) foundId = u.id;
      if (list.users.length < 200) break;
    }
    if (!foundId) {
      throw new Error("Usuário não encontrado. Ele precisa criar uma conta primeiro em /auth.");
    }
    const { error } = await supabaseAdmin.from("workspace_members").upsert(
      { workspace_id: data.workspaceId, user_id: foundId, role: data.role },
      { onConflict: "workspace_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, user_id: foundId };
  });

export const inviteMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; email: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!ROLES.includes(data.role)) throw new Error("Papel inválido.");
    await assertAdmin(context.supabase, data.workspaceId, context.userId);

    const email = normalizeEmail(data.email);
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = await hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const origin = await getOrigin();
    const inviteLink = `${origin}/auth?invite=${encodeURIComponent(token)}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_invitations").insert({
      workspace_id: data.workspaceId,
      email,
      role: data.role,
      token_hash: tokenHash,
      invited_by: context.userId,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: inviteLink,
        data: { invited_workspace_id: data.workspaceId, invited_workspace_role: data.role },
      });
      if (inviteError) {
        emailError = inviteError.message;
      } else {
        emailSent = true;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Falha ao enviar e-mail.";
    }

    return { ok: true as const, inviteLink, emailSent, emailError, expiresAt };
  });

export const listWorkspaceInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("workspace_invitations")
      .select("id, email, role, accepted_at, expires_at, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const acceptWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data, context }) => {
    const token = data.token.trim();
    if (token.length < 20) throw new Error("Convite inválido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("workspace_invitations")
      .select("id, workspace_id, email, role, accepted_at, expires_at")
      .eq("token_hash", await hashInviteToken(token))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Convite não encontrado ou expirado.");
    if (invite.accepted_at) throw new Error("Este convite já foi usado.");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error("Este convite expirou.");
    }

    const signedEmail = normalizeEmail(String(context.claims.email ?? ""));
    if (signedEmail !== invite.email) {
      throw new Error(`Entre com o email ${invite.email} para aceitar este convite.`);
    }

    const { error: memberError } = await supabaseAdmin.from("workspace_members").upsert(
      { workspace_id: invite.workspace_id, user_id: context.userId, role: invite.role },
      { onConflict: "workspace_id,user_id" },
    );
    if (memberError) throw new Error(memberError.message);

    const { error: acceptError } = await supabaseAdmin
      .from("workspace_invitations")
      .update({ accepted_by: context.userId, accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (acceptError) throw new Error(acceptError.message);

    return { ok: true as const, workspaceId: invite.workspace_id };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; userId: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!ROLES.includes(data.role)) throw new Error("Papel inválido.");
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_members")
      .update({ role: data.role })
      .eq("workspace_id", data.workspaceId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_members")
      .delete().eq("workspace_id", data.workspaceId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Bulk fix: rename contacts whose name matches a workspace member's full_name
// (the bug where fromMe messages captured the WA owner's pushName).
export const refreshContactNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: members } = await context.supabase
      .from("workspace_members").select("user_id").eq("workspace_id", data.workspaceId);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length === 0) return { updated: 0 };
    const { data: profs } = await context.supabase
      .from("profiles").select("full_name").in("id", ids);
    const names = (profs ?? [])
      .map((p: any) => (p.full_name ?? "").trim())
      .filter((n: string) => n.length > 0);
    if (names.length === 0) return { updated: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bad } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, whatsapp, name")
      .eq("workspace_id", data.workspaceId)
      .in("name", names);
    let updated = 0;
    for (const c of bad ?? []) {
      const fallback = c.phone || c.whatsapp || "Contato sem nome";
      const { error } = await supabaseAdmin.from("contacts")
        .update({ name: fallback }).eq("id", c.id);
      if (!error) updated++;
    }
    return { updated };
  });
