import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve o nome exibido do atendente para assinar mensagens enviadas ao cliente.
 * Ordem: profiles.full_name -> user_metadata (full_name/name) -> prefixo do e-mail.
 */
export async function resolveSenderName(
  admin: SupabaseClient<any, any, any>,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return "";
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const fromProfile = (profile?.full_name ?? "").trim();
    if (fromProfile && !fromProfile.includes("@")) return fromProfile;

    const { data: userRes } = await admin.auth.admin.getUserById(userId);
    const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const metaName = String(meta["full_name"] ?? meta["name"] ?? "").trim();
    if (metaName && !metaName.includes("@")) return metaName;

    const email = userRes?.user?.email ?? fromProfile;
    if (email) {
      const local = email.split("@")[0] ?? "";
      return local.replace(/[._-]+/g, " ").trim();
    }
    return fromProfile;
  } catch {
    return "";
  }
}
