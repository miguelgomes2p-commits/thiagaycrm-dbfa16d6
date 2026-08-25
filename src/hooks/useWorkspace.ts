import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceMode = "individual" | "shared";

export type WorkspaceWithRole = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role: string;
  feature_renave: boolean;
  feature_ai: boolean;
  feature_inventory: boolean;
  feature_fiscal: boolean;
  workspace_mode: WorkspaceMode;
};

/* ------------------------------------------------------------------ */
/* Workspace ativo (seleção local por navegador)                        */
/* ------------------------------------------------------------------ */

const ACTIVE_WS_KEY = "lupus.active_workspace";
const listeners = new Set<() => void>();

export function getActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_WS_KEY);
}

export function setActiveWorkspaceId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(ACTIVE_WS_KEY, id);
  else window.localStorage.removeItem(ACTIVE_WS_KEY);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useActiveWorkspaceId(): string | null {
  return useSyncExternalStore(subscribe, getActiveWorkspaceId, () => null);
}

/** Indica se o usuário logado pertence à equipe de Suporte (acesso global). */
export function useIsSupportStaff() {
  return useQuery({
    queryKey: ["is-support-staff"],
    queryFn: async (): Promise<boolean> => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return false;
      const { data } = await supabase
        .from("support_staff")
        .select("enabled")
        .eq("user_id", uid)
        .maybeSingle();
      return !!data?.enabled;
    },
  });
}

/**
 * Lista os workspaces do usuário. O workspace ativo (escolhido no seletor)
 * é sempre retornado na primeira posição — todas as telas usam `[0]`.
 *
 * Equipe de Suporte: enxerga TODOS os workspaces (papel `support`, com
 * permissões de admin exceto gerenciamento de equipe).
 */
export function useMyWorkspaces() {
  const activeId = useActiveWorkspaceId();
  const query = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: async (): Promise<WorkspaceWithRole[]> => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return [];

      const { data: members, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces:workspace_id(id, name, slug, logo_url, feature_renave, feature_ai, feature_inventory, feature_fiscal, workspace_mode)")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const own = (members ?? [])
        .map((r) => {
          if (!r.workspaces) return null;
          const w = r.workspaces as unknown as Omit<WorkspaceWithRole, "role" | "workspace_mode"> & { workspace_mode?: WorkspaceMode | null };
          return { ...w, workspace_mode: w.workspace_mode ?? "individual", role: r.role };
        })
        .filter(Boolean) as WorkspaceWithRole[];

      // Suporte já possui associação `support` em todos os workspaces
      // (sincronizada no backend), então a lista acima cobre o acesso global.
      return own;
    },
  });

  const ordered = useMemo(() => {
    const rows = query.data;
    if (!rows || !activeId) return rows;
    const idx = rows.findIndex((w) => w.id === activeId);
    if (idx <= 0) return rows;
    return [rows[idx]!, ...rows.filter((_, i) => i !== idx)];
  }, [query.data, activeId]);

  // Limpa uma seleção obsoleta (workspace removido / sem acesso).
  useEffect(() => {
    if (!activeId || !query.data || query.data.length === 0) return;
    if (!query.data.some((w) => w.id === activeId)) setActiveWorkspaceId(null);
  }, [activeId, query.data]);

  return { ...query, data: ordered };
}


export function useCurrentProfile() {
  return useQuery({
    queryKey: ["profile-me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getSession();
      if (!u.session?.user) return null;
      const { data, error } = await supabase
        .from("profiles").select("*").eq("id", u.session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
