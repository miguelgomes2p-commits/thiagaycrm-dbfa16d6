import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadFieldDefinition, LeadFieldGroup } from "@/lib/lead-fields";

type Row = Record<string, unknown>;

function normalizeDefinition(row: Row): LeadFieldDefinition {
  return {
    id: String(row["id"]),
    workspace_id: String(row["workspace_id"]),
    entity_type: String(row["entity_type"] ?? "lead"),
    field_key: String(row["field_key"]),
    label: String(row["label"]),
    field_type: (row["field_type"] ?? "TEXT") as LeadFieldDefinition["field_type"],
    group_id: (row["group_id"] as string | null) ?? null,
    placeholder: (row["placeholder"] as string | null) ?? null,
    help_text: (row["help_text"] as string | null) ?? null,
    default_value: (row["default_value"] as string | null) ?? null,
    options: Array.isArray(row["options"]) ? (row["options"] as LeadFieldDefinition["options"]) : [],
    validation: (row["validation"] as Record<string, unknown>) ?? {},
    display_config: (row["display_config"] as LeadFieldDefinition["display_config"]) ?? {},
    pipeline_ids: Array.isArray(row["pipeline_ids"]) ? (row["pipeline_ids"] as string[]) : [],
    required_stage_ids: Array.isArray(row["required_stage_ids"]) ? (row["required_stage_ids"] as string[]) : [],
    conditional_rules: Array.isArray(row["conditional_rules"]) ? (row["conditional_rules"] as LeadFieldDefinition["conditional_rules"]) : [],
    is_required: Boolean(row["is_required"]),
    is_system: Boolean(row["is_system"]),
    is_active: Boolean(row["is_active"]),
    is_searchable: Boolean(row["is_searchable"]),
    is_filterable: Boolean(row["is_filterable"]),
    sort_order: Number(row["sort_order"] ?? 0),
  };
}

/**
 * Field Registry do workspace. Definições mudam raramente → cache longo,
 * invalidado explicitamente pelo admin ao salvar (queryKey "lead-fields").
 */
export function useLeadFields(workspaceId?: string | null) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ["lead-fields", workspaceId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ definitions: LeadFieldDefinition[]; groups: LeadFieldGroup[] }> => {
      const [{ data: defs, error: defsErr }, { data: groups, error: groupsErr }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("lead_field_definitions" as any) as any)
          .select("*")
          .eq("workspace_id", workspaceId!)
          .order("sort_order"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("lead_field_groups" as any) as any)
          .select("*")
          .eq("workspace_id", workspaceId!)
          .order("sort_order"),
      ]);
      if (defsErr) throw defsErr;
      if (groupsErr) throw groupsErr;
      return {
        definitions: ((defs ?? []) as Row[]).map(normalizeDefinition),
        groups: ((groups ?? []) as Row[]).map((g) => ({
          id: String(g["id"]),
          workspace_id: String(g["workspace_id"]),
          name: String(g["name"]),
          sort_order: Number(g["sort_order"] ?? 0),
          is_active: Boolean(g["is_active"]),
        })),
      };
    },
  });
}

export function useWorkspaceLocations(workspaceId?: string | null) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ["workspace-locations", workspaceId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("workspace_locations" as any) as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as {
        id: string; workspace_id: string; name: string; address: string | null;
        latitude: number; longitude: number; is_active: boolean; is_default: boolean;
      }[];
    },
  });
}
