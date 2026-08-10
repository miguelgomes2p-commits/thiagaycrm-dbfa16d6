import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve o nome exibido do atendente para assinar mensagens enviadas ao cliente.
 * Ordem: profiles.full_name -> user_metadata (full_name/name) -> prefixo do e-mail.
 */
export async function resolveSenderName(
  admin: SupabaseClient<any, any, any>,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) throw new Error("Não foi possível identificar o atendente desta sessão");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`Falha ao identificar atendente: ${profileError.message}`);
  const fromProfile = (profile?.full_name ?? "").trim();
  if (fromProfile && !fromProfile.includes("@")) return fromProfile;

  const { data: userRes, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) throw new Error(`Falha ao identificar atendente: ${userError.message}`);
  const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = String(meta["full_name"] ?? meta["name"] ?? "").trim();
  if (metaName && !metaName.includes("@")) return metaName;

  const email = userRes?.user?.email ?? fromProfile;
  if (email) {
    const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
    if (local) return local;
  }

  throw new Error("Cadastre o nome do atendente antes de enviar mensagens");
}
