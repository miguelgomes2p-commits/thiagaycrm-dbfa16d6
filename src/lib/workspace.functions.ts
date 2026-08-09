import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertWorkspaceAdmin,
  getRequestOrigin,
  hashInviteToken,
  isWorkspaceRole,
  normalizeInviteEmail,
  type WorkspaceRole,
} from "@/lib/workspace.server";

type Role = WorkspaceRole;

export const listWorkspaceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase
      .from("workspace_members")
      .select("user_id, role, created_at, is_active, accepts_new_leads")
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
      is_active: m.is_active ?? true,
      accepts_new_leads: m.accepts_new_leads ?? true,
      full_name: (profs ?? []).find((p: any) => p.id === m.user_id)?.full_name ?? null,
      email: emails.get(m.user_id) ?? null,
    }));
  });

export const addMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; email: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!isWorkspaceRole(data.role)) throw new Error("Papel inválido.");
    await assertWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);
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
    if (!isWorkspaceRole(data.role)) throw new Error("Papel inválido.");
    await assertWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);

    const email = normalizeInviteEmail(data.email);
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const origin = getRequestOrigin();
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
    await assertWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);
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
      .select("id, workspace_id, email, role, accepted_by, accepted_at, expires_at")
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Convite não encontrado ou expirado.");
    if (invite.accepted_at) {
      if (invite.accepted_by === context.userId) {
        return { ok: true as const, workspaceId: invite.workspace_id };
      }
      throw new Error("Este convite já foi usado.");
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error("Este convite expirou.");
    }

    const signedEmail = normalizeInviteEmail(String(context.claims.email ?? ""));
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

export const completeWorkspaceInviteWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; email: string; password: string; fullName?: string }) => d)
  .handler(async ({ data }) => {
    const token = String(data.token ?? "").trim();
    if (token.length < 20) throw new Error("Convite inválido.");

    const email = normalizeInviteEmail(String(data.email ?? ""));
    const password = String(data.password ?? "");
    const fullName = String(data.fullName ?? "").trim();

    if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("workspace_invitations")
      .select("id, workspace_id, email, role, accepted_by, accepted_at, expires_at")
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Convite não encontrado ou expirado.");
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error("Este convite expirou. Peça um novo convite ao administrador.");
    }
    if (email !== invite.email) {
      throw new Error(`Use o email ${invite.email} para aceitar este convite.`);
    }

    let userId: string | null = null;
    for (let page = 1; page <= 5 && !userId; page++) {
      const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) throw new Error(listError.message);
      const found = list.users.find((user) => (user.email ?? "").toLowerCase() === email);
      if (found) userId = found.id;
      if (list.users.length < 200) break;
    }

    if (invite.accepted_by && userId && invite.accepted_by !== userId) {
      throw new Error("Este convite já foi usado por outro usuário.");
    }
    if (invite.accepted_by && !userId) {
      throw new Error("Este convite já foi usado. Peça um novo convite ao administrador.");
    }

    if (userId) {
      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (updateError) throw new Error(updateError.message);
      userId = updated.user?.id ?? userId;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : { full_name: email },
      });
      if (createError) throw new Error(createError.message);
      userId = created.user?.id ?? null;
    }

    if (!userId) throw new Error("Não foi possível criar o usuário do convite.");

    if (fullName) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, full_name: fullName }, { onConflict: "id" });
      if (profileError) throw new Error(profileError.message);
    }

    const { error: memberError } = await supabaseAdmin.from("workspace_members").upsert(
      { workspace_id: invite.workspace_id, user_id: userId, role: invite.role },
      { onConflict: "workspace_id,user_id" },
    );
    if (memberError) throw new Error(memberError.message);

    const now = new Date().toISOString();
    const { error: acceptError } = await supabaseAdmin
      .from("workspace_invitations")
      .update({ accepted_by: userId, accepted_at: invite.accepted_at ?? now })
      .eq("id", invite.id);
    if (acceptError) throw new Error(acceptError.message);

    return { ok: true as const, email };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; userId: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    if (!isWorkspaceRole(data.role)) throw new Error("Papel inválido.");
    await assertWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);
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
    await assertWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_members")
      .delete().eq("workspace_id", data.workspaceId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateMemberQueueSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspaceId: string; userId: string; is_active?: boolean; accepts_new_leads?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertWorkspaceAdmin(context.supabase, data.workspaceId, context.userId);
    const patch: { is_active?: boolean; accepts_new_leads?: boolean } = {};
    if (typeof data.is_active === "boolean") patch.is_active = data.is_active;
    if (typeof data.accepts_new_leads === "boolean") patch.accepts_new_leads = data.accepts_new_leads;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspace_members")
      .update(patch)
      .eq("workspace_id", data.workspaceId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const transferConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; toUserId: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("transfer_conversation", {
      _conversation_id: data.conversationId,
      _to_user: data.toUserId,
      _reason: data.reason ?? undefined,
    });
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
