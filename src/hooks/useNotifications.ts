import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppNotification = {
  id: string;
  workspace_id: string;
  recipient_user_id: string;
  type: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 30;

export function useNotifications(userId?: string) {
  const qc = useQueryClient();
  const onInsertRef = useRef<((n: AppNotification) => void) | null>(null);

  const query = useQuery({
    enabled: !!userId,
    queryKey: ["notifications", userId],
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as unknown as AppNotification[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as unknown as AppNotification;
            qc.setQueryData<AppNotification[]>(["notifications", userId], (prev) => {
              if (prev?.some((n) => n.id === row.id)) return prev;
              return [row, ...(prev ?? [])].slice(0, PAGE_SIZE);
            });
            onInsertRef.current?.(row);
            return;
          }
          qc.invalidateQueries({ queryKey: ["notifications", userId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  const items = query.data ?? [];
  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markAsRead(id: string) {
    const now = new Date().toISOString();
    qc.setQueryData<AppNotification[]>(["notifications", userId], (prev) =>
      (prev ?? []).map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)),
    );
    await supabase.from("notifications").update({ read_at: now }).eq("id", id).is("read_at", null);
  }

  async function markAllAsRead() {
    const now = new Date().toISOString();
    qc.setQueryData<AppNotification[]>(["notifications", userId], (prev) =>
      (prev ?? []).map((n) => ({ ...n, read_at: n.read_at ?? now })),
    );
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null);
  }

  return {
    items,
    unreadCount,
    isLoading: query.isLoading,
    markAsRead,
    markAllAsRead,
    onNewNotification: (cb: (n: AppNotification) => void) => { onInsertRef.current = cb; },
  };
}
