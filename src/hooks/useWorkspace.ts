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
  workspace_mode: WorkspaceMode;
};

export function useMyWorkspaces() {
  return useQuery({
    queryKey: ["my-workspaces"],
    queryFn: async (): Promise<WorkspaceWithRole[]> => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("workspace_members")
        .select("role, workspaces:workspace_id(id, name, slug, logo_url, feature_renave, feature_ai, workspace_mode)")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          if (!r.workspaces) return null;
          const w = r.workspaces as unknown as Omit<WorkspaceWithRole, "role" | "workspace_mode"> & { workspace_mode?: WorkspaceMode | null };
          return { ...w, workspace_mode: w.workspace_mode ?? "individual", role: r.role };
        })
        .filter(Boolean) as WorkspaceWithRole[];
    },
  });
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
