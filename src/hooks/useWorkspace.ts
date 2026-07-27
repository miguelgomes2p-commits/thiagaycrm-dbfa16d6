import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceWithRole = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role: string;
  feature_renave: boolean;
  feature_ai: boolean;
};

export function useMyWorkspaces() {
  return useQuery({
    queryKey: ["my-workspaces"],
    queryFn: async (): Promise<WorkspaceWithRole[]> => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("role, workspaces:workspace_id(id, name, slug, logo_url, feature_renave, feature_ai)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.workspaces ? { ...(r.workspaces as unknown as Omit<WorkspaceWithRole, "role">), role: r.role } : null)
        .filter(Boolean) as WorkspaceWithRole[];
    },
  });
}

export function useCurrentProfile() {
  return useQuery({
    queryKey: ["profile-me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getSession();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
