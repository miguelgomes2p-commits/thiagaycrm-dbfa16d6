import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LabelLike } from "@/components/labels/LabelBadge";

export type Label = LabelLike & {
  workspace_id: string;
  scope: "conversation" | "contact" | "lead";
  kind: "system" | "custom";
  system_ref: string | null;
  sort_order: number;
  archived: boolean;
};

export function useLabels(workspaceId?: string, scope: "conversation" | "contact" | "lead" = "conversation") {
  const qc = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`labels-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "labels", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["labels", workspaceId, scope] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, scope, qc]);

  return useQuery({
    enabled: !!workspaceId,
    queryKey: ["labels", workspaceId, scope],
    queryFn: async (): Promise<Label[]> => {
      const { data, error } = await supabase
        .from("labels")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("scope", scope)
        .eq("archived", false)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Label[];
    },
  });
}

export function useConversationLabels(workspaceId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`conv-labels-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_labels", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation_labels", workspaceId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);

  return useQuery({
    enabled: !!workspaceId,
    queryKey: ["conversation_labels", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_labels")
        .select("conversation_id, label_id")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      const map = new Map<string, string[]>();
      for (const row of data ?? []) {
        const arr = map.get(row.conversation_id) ?? [];
        arr.push(row.label_id);
        map.set(row.conversation_id, arr);
      }
      return map;
    },
  });
}

export function useAssignLabel(workspaceId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, labelId }: { conversationId: string; labelId: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("conversation_labels")
        .insert({
          conversation_id: conversationId,
          label_id: labelId,
          workspace_id: workspaceId!,
          assigned_by: u.user?.id,
        });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation_labels", workspaceId] }),
  });
}

export function useRemoveLabel(workspaceId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, labelId }: { conversationId: string; labelId: string }) => {
      const { error } = await supabase
        .from("conversation_labels")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("label_id", labelId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversation_labels", workspaceId] }),
  });
}
