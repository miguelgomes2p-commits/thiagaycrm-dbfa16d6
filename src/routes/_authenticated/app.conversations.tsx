import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useServerFn } from "@tanstack/react-start";
import {
  sendWhatsappMessage,
  takeConversation,
  releaseConversation,
  resolveConversation,
} from "@/lib/whatsapp.functions";
import { useLabels, useConversationLabels, useAssignLabel, useRemoveLabel } from "@/hooks/useLabels";
import { LabelBadge } from "@/components/labels/LabelBadge";
import { LabelPicker } from "@/components/labels/LabelPicker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Send, Search, Phone, Instagram, Facebook, Mail, Globe,
  Check, CheckCheck, AlertTriangle, UserPlus, UserMinus, CheckCircle2,
  Tag, Filter, ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/conversations")({
  component: ConversationsPage,
});

const channelIcon = {
  whatsapp: Phone, instagram: Instagram, facebook: Facebook, email: Mail,
  webchat: Globe, telegram: Send, sms: Phone,
} as const;

type GroupMode = "none" | "label" | "status" | "channel";
type SortMode = "recent" | "oldest" | "unread" | "name";
type FilterMode = "OR" | "AND";

const STORAGE_KEY = "inbox-view-v1";

function loadView() {
  if (typeof window === "undefined") return { activeLabels: [] as string[], groupBy: "none" as GroupMode, sortBy: "recent" as SortMode, filterMode: "OR" as FilterMode, search: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeLabels: [], groupBy: "none" as GroupMode, sortBy: "recent" as SortMode, filterMode: "OR" as FilterMode, search: "" };
    const p = JSON.parse(raw);
    return {
      activeLabels: Array.isArray(p.activeLabels) ? p.activeLabels : [],
      groupBy: (p.groupBy as GroupMode) ?? "none",
      sortBy: (p.sortBy as SortMode) ?? "recent",
      filterMode: (p.filterMode as FilterMode) ?? "OR",
      search: "",
    };
  } catch { return { activeLabels: [], groupBy: "none" as GroupMode, sortBy: "recent" as SortMode, filterMode: "OR" as FilterMode, search: "" }; }
}

function ConversationsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [view, setView] = useState(loadView);
  const [labelPaneOpen, setLabelPaneOpen] = useState(true);
  const qc = useQueryClient();
  const sendWa = useServerFn(sendWhatsappMessage);
  const takeFn = useServerFn(takeConversation);
  const releaseFn = useServerFn(releaseConversation);
  const resolveFn = useServerFn(resolveConversation);

  const { data: labels } = useLabels(ws?.id);
  const { data: convLabelMap } = useConversationLabels(ws?.id);
  const assignLabel = useAssignLabel(ws?.id);
  const removeLabel = useRemoveLabel(ws?.id);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeLabels: view.activeLabels, groupBy: view.groupBy,
      sortBy: view.sortBy, filterMode: view.filterMode,
    }));
  }, [view.activeLabels, view.groupBy, view.sortBy, view.filterMode]);

  const convsQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["conversations", ws?.id],
    queryFn: async () => {
      const { data } = await supabase.from("conversations")
        .select("*, contacts:contact_id(name, type, avatar_url)")
        .eq("workspace_id", ws!.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);

        .limit(200);
      return data ?? [];
    },
  });

  // Membros do workspace + perfis para mostrar quem está atendendo cada conversa
  const membersQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["workspace-members-profiles", ws?.id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", ws!.id);
      const ids = (members ?? []).map((m) => m.user_id);
      if (ids.length === 0) return new Map<string, { name: string; role: string }>();
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const byId = new Map<string, { name: string; role: string }>();
      (members ?? []).forEach((m) => {
        const p = (profiles ?? []).find((x) => x.id === m.user_id);
        byId.set(m.user_id, { name: p?.full_name ?? "Membro", role: m.role });
      });
      return byId;
    },
  });

  const msgsQ = useQuery({
    enabled: !!activeId,
    queryKey: ["messages", activeId],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", activeId!).order("created_at");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!activeId) return;
    const ch = supabase.channel(`msgs-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", activeId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, qc]);

  useEffect(() => {
    if (!ws?.id) return;
    const ch = supabase.channel(`convs-${ws.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${ws.id}` },
        () => qc.invalidateQueries({ queryKey: ["conversations", ws.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ws?.id, qc]);

  const labelById = useMemo(() => {
    const m = new Map<string, typeof labels extends (infer T)[] | undefined ? T : never>();
    (labels ?? []).forEach((l) => m.set(l.id, l));
    return m;
  }, [labels]);

  // Filtered + sorted list
  const visible = useMemo(() => {
    let list = convsQ.data ?? [];
    if (view.search.trim()) {
      const q = view.search.trim().toLowerCase();
      list = list.filter((c) => {
        const name = ((c.contacts as { name?: string } | null)?.name ?? "").toLowerCase();
        const preview = (c.last_message_preview ?? "").toLowerCase();
        return name.includes(q) || preview.includes(q);
      });
    }
    if (view.activeLabels.length > 0) {
      const active = new Set(view.activeLabels);
      list = list.filter((c) => {
        const ids = convLabelMap?.get(c.id) ?? [];
        if (view.filterMode === "AND") return view.activeLabels.every((id: string) => ids.includes(id));
        return ids.some((id) => active.has(id));
      });
    }
    const sorted = [...list];
    switch (view.sortBy) {
      case "oldest":
        sorted.sort((a, b) => (a.last_message_at ?? "").localeCompare(b.last_message_at ?? ""));
        break;
      case "unread":
        sorted.sort((a, b) => (b.unread_count ?? 0) - (a.unread_count ?? 0));
        break;
      case "name":
        sorted.sort((a, b) => {
          const na = ((a.contacts as { name?: string } | null)?.name ?? "").toLowerCase();
          const nb = ((b.contacts as { name?: string } | null)?.name ?? "").toLowerCase();
          return na.localeCompare(nb);
        });
        break;
      default:
        sorted.sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
    }
    return sorted;
  }, [convsQ.data, view, convLabelMap]);

  // Grouped
  const grouped = useMemo((): Array<{ key: string; title: string; color?: string | undefined; items: typeof visible }> => {
    if (view.groupBy === "none") return [{ key: "all", title: "", items: visible }];
    if (view.groupBy === "status") {
      const buckets = new Map<string, typeof visible>();
      for (const c of visible) {
        const k = c.status ?? "open";
        (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(c);
      }
      const statusOrder = ["open", "pending", "resolved", "closed"];
      return statusOrder.filter((s) => buckets.has(s)).map((s) => ({
        key: s, title: s.charAt(0).toUpperCase() + s.slice(1), items: buckets.get(s)!,
      }));
    }
    if (view.groupBy === "channel") {
      const buckets = new Map<string, typeof visible>();
      for (const c of visible) {
        const k = c.channel ?? "webchat";
        (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(c);
      }
      return Array.from(buckets.entries()).map(([k, items]) => ({ key: k, title: k, items }));
    }
    // by label
    const buckets = new Map<string, typeof visible>();
    const untagged: typeof visible = [];
    for (const c of visible) {
      const ids = convLabelMap?.get(c.id) ?? [];
      if (ids.length === 0) { untagged.push(c); continue; }
      for (const id of ids) {
        (buckets.get(id) ?? buckets.set(id, []).get(id)!).push(c);
      }
    }
    const groups = (labels ?? [])
      .filter((l) => buckets.has(l.id))
      .map((l) => ({ key: l.id, title: l.name, color: l.color, items: buckets.get(l.id)! }));
    if (untagged.length > 0) groups.push({ key: "untagged", title: "Sem etiqueta", color: "#64748b", items: untagged });
    return groups;
  }, [visible, view.groupBy, convLabelMap, labels]);

  const active = useMemo(() => convsQ.data?.find((c) => c.id === activeId), [convsQ.data, activeId]);
  const activeLabelIds = active ? (convLabelMap?.get(active.id) ?? []) : [];
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgsQ.data]);

  // Counts per label (unread inbound-first proxy: use unread_count)
  const labelCounts = useMemo(() => {
    const map = new Map<string, { total: number; unread: number }>();
    for (const c of convsQ.data ?? []) {
      const ids = convLabelMap?.get(c.id) ?? [];
      for (const id of ids) {
        const cur = map.get(id) ?? { total: 0, unread: 0 };
        cur.total++;
        cur.unread += c.unread_count ?? 0;
        map.set(id, cur);
      }
    }
    return map;
  }, [convsQ.data, convLabelMap]);

  async function sendMessage() {
    if (!text.trim() || !active || !ws) return;
    const content = text.trim();
    const isWa = active.channel === "whatsapp" && !!(active as { whatsapp_number_id?: string | null }).whatsapp_number_id;
    setText("");
    setSending(true);
    try {
      if (isWa) {
        await sendWa({ data: { conversationId: active.id, body: content } });
      } else {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("messages").insert({
          workspace_id: ws.id, conversation_id: active.id, direction: "outbound", sender_type: "user",
          sender_user_id: u.user?.id, content,
        });
        await supabase.from("conversations").update({
          last_message_preview: content, last_message_at: new Date().toISOString(),
        }).eq("id", active.id);
      }
      qc.invalidateQueries({ queryKey: ["messages", active.id] });
      qc.invalidateQueries({ queryKey: ["conversations", ws.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
      setText(content);
    } finally { setSending(false); }
  }

  async function take() {
    if (!active) return;
    try { await takeFn({ data: { conversationId: active.id } }); toast.success("Conversa atribuída a você");
      qc.invalidateQueries({ queryKey: ["conversations", ws?.id] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function release() {
    if (!active) return;
    try { await releaseFn({ data: { conversationId: active.id } }); toast.success("Devolvido para a fila");
      qc.invalidateQueries({ queryKey: ["conversations", ws?.id] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function resolve() {
    if (!active) return;
    try { await resolveFn({ data: { conversationId: active.id } }); toast.success("Conversa resolvida");
      qc.invalidateQueries({ queryKey: ["conversations", ws?.id] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }



  function toggleLabelFilter(id: string) {
    setView((v) => ({
      ...v,
      activeLabels: v.activeLabels.includes(id)
        ? v.activeLabels.filter((x: string) => x !== id)
        : [...v.activeLabels, id],
    }));
  }

  async function toggleActiveLabel(labelId: string, currentlyActive: boolean) {
    if (!active) return;
    if (currentlyActive) {
      await removeLabel.mutateAsync({ conversationId: active.id, labelId });
    } else {
      await assignLabel.mutateAsync({ conversationId: active.id, labelId });
    }
  }

  const systemLabels = (labels ?? []).filter((l) => l.kind === "system");
  const customLabels = (labels ?? []).filter((l) => l.kind === "custom");

  return (
    <div className="h-full flex">
      {/* Labels pane */}
      <div className={cn(
        "border-r border-border flex flex-col shrink-0 bg-surface/30 transition-all",
        labelPaneOpen ? "w-56" : "w-10",
      )}>
        <div className="h-14 px-2 flex items-center border-b border-border">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setLabelPaneOpen((v) => !v)}>
            {labelPaneOpen ? <ChevronRight className="h-4 w-4 rotate-180" /> : <Filter className="h-4 w-4" />}
          </Button>
          {labelPaneOpen && <span className="ml-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Etiquetas</span>}
        </div>
        {labelPaneOpen && (
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            <button
              onClick={() => setView((v) => ({ ...v, activeLabels: [] }))}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between",
                view.activeLabels.length === 0 ? "bg-primary/15 text-primary" : "hover:bg-surface",
              )}
            >
              <span>Todas as conversas</span>
              <span className="opacity-60">{convsQ.data?.length ?? 0}</span>
            </button>

            {systemLabels.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">Números WhatsApp</div>
                <div className="space-y-0.5">
                  {systemLabels.map((l) => {
                    const active = view.activeLabels.includes(l.id);
                    const count = labelCounts.get(l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={() => toggleLabelFilter(l.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-surface transition-colors",
                          active && "bg-primary/15",
                        )}
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        <span className="flex-1 truncate">{l.name}</span>
                        {count && count.unread > 0 && (
                          <span className="text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 min-w-[18px] text-center">{count.unread}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1 flex items-center justify-between">
                <span>Personalizadas</span>
                <a href="/app/labels" className="hover:text-foreground normal-case tracking-normal">+ nova</a>
              </div>
              {customLabels.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-2">
                  Nenhuma ainda. <a className="text-primary hover:underline" href="/app/labels">Criar</a>
                </div>
              )}
              <div className="space-y-0.5">
                {customLabels.map((l) => {
                  const active = view.activeLabels.includes(l.id);
                  const count = labelCounts.get(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLabelFilter(l.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-surface transition-colors",
                        active && "bg-primary/15",
                      )}
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                      <span className="flex-1 truncate">{l.name}</span>
                      {count && count.total > 0 && (
                        <span className="text-[10px] text-muted-foreground">{count.total}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {view.activeLabels.length > 1 && (
              <div className="px-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Modo</div>
                <div className="flex gap-1">
                  {(["OR", "AND"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setView((v) => ({ ...v, filterMode: m }))}
                      className={cn(
                        "flex-1 text-[10px] py-1 rounded border",
                        view.filterMode === m ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-surface",
                      )}
                    >
                      {m === "OR" ? "Qualquer" : "Todas"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-semibold text-sm">Conversas</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-8 h-8 text-xs"
              value={view.search}
              onChange={(e) => setView((v) => ({ ...v, search: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Select value={view.groupBy} onValueChange={(v) => setView((s) => ({ ...s, groupBy: v as GroupMode }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Agrupar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem grupo</SelectItem>
                <SelectItem value="label">Por etiqueta</SelectItem>
                <SelectItem value="channel">Por canal</SelectItem>
                <SelectItem value="status">Por status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={view.sortBy} onValueChange={(v) => setView((s) => ({ ...s, sortBy: v as SortMode }))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="oldest">Mais antigas</SelectItem>
                <SelectItem value="unread">Não lidas</SelectItem>
                <SelectItem value="name">Nome A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nenhuma conversa.
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.key}>
              {view.groupBy !== "none" && (
                <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border flex items-center gap-2">
                  {g.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />}
                  <span>{g.title}</span>
                  <span className="opacity-60">· {g.items.length}</span>
                </div>
              )}
              {g.items.map((c) => {
                const Icon = channelIcon[c.channel as keyof typeof channelIcon] ?? MessageSquare;
                const contact = c.contacts as { name?: string; type?: string } | null;
                const name = contact?.name ?? "Anônimo";
                const isGroup = contact?.type === "group";
                const ids = convLabelMap?.get(c.id) ?? [];
                const pills = ids.map((id) => labelById.get(id)).filter(Boolean).slice(0, 3);
                const extra = ids.length - pills.length;
                const assignedId = (c as { assigned_to?: string | null }).assigned_to ?? null;
                const agent = assignedId ? membersQ.data?.get(assignedId) : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "w-full text-left p-3 border-b border-border hover:bg-surface/50 transition-colors flex gap-3",
                      activeId === c.id && "bg-surface",
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {isGroup ? "GR" : name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate flex items-center gap-1.5">
                          {isGroup && <span className="text-[9px] uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded">Grupo</span>}
                          {name}
                        </span>
                        {c.last_message_at && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(c.last_message_at), { locale: ptBR, addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{c.last_message_preview ?? "—"}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Icon className="h-3 w-3" /> {c.channel}
                        {agent ? (
                          <span className="flex items-center gap-1 text-primary/90">
                            · <UserPlus className="h-2.5 w-2.5" /> {agent.name}
                          </span>
                        ) : assignedId ? null : (
                          <span className="text-amber-400/80">· sem responsável</span>
                        )}
                        {(c.unread_count ?? 0) > 0 && (
                          <span className="ml-auto text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5">{c.unread_count}</span>
                        )}
                      </div>
                      {pills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {pills.map((l) => l && <LabelBadge key={l.id} label={l} size="xs" variant="soft" />)}
                          {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!active ? (
          <div className="flex-1 grid place-items-center text-center text-muted-foreground p-8">
            <div>
              <MessageSquare className="h-12 w-12 mx-auto opacity-30 mb-3" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-14 border-b border-border px-4 flex items-center gap-3 shrink-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                  {((active.contacts as { name?: string } | null)?.name ?? "??").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{(active.contacts as { name?: string } | null)?.name ?? "Anônimo"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span>{active.channel} · {active.status}</span>
                  {(() => {
                    const aid = (active as { assigned_to?: string | null }).assigned_to ?? null;
                    const ag = aid ? membersQ.data?.get(aid) : null;
                    if (ag) return <span className="text-primary/90">· Atendendo: <b className="text-foreground">{ag.name}</b></span>;
                    if (!aid) return <span className="text-amber-400/80">· na fila</span>;
                    return null;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <LabelPicker
                  labels={labels ?? []}
                  activeIds={activeLabelIds}
                  onToggle={toggleActiveLabel}
                  trigger={
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5">
                      <Tag className="h-3.5 w-3.5" /> Etiquetas
                      {activeLabelIds.length > 0 && (
                        <span className="text-[10px] bg-primary/20 text-primary rounded-full px-1.5 min-w-[18px]">{activeLabelIds.length}</span>
                      )}
                    </Button>
                  }
                />
                {(active as { assigned_to?: string | null }).assigned_to ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={release}><UserMinus className="h-4 w-4 mr-1" />Devolver</Button>
                    <Button size="sm" variant="ghost" onClick={resolve}><CheckCircle2 className="h-4 w-4 mr-1" />Resolver</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={take}><UserPlus className="h-4 w-4 mr-1" />Pegar</Button>
                )}
              </div>
            </div>

            {activeLabelIds.length > 0 && (
              <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5 bg-surface/30">
                {activeLabelIds.map((id) => {
                  const l = labelById.get(id);
                  if (!l) return null;
                  return (
                    <LabelBadge
                      key={id}
                      label={l}
                      size="sm"
                      variant="soft"
                      onRemove={() => removeLabel.mutate({ conversationId: active.id, labelId: id })}
                    />
                  );
                })}
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgsQ.data?.map((m) => {
                const status = (m as { delivery_status?: string }).delivery_status;
                const err = (m as { error_message?: string | null }).error_message;
                return (
                  <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-md rounded-2xl px-4 py-2 text-sm",
                      m.direction === "outbound"
                        ? "gradient-brand text-primary-foreground rounded-br-sm"
                        : m.sender_type === "ai"
                          ? "bg-accent/20 text-accent-foreground border border-accent/30 rounded-bl-sm"
                          : "bg-surface border border-border rounded-bl-sm"
                    )}>
                      {m.content}
                      <div className="mt-1 text-[10px] opacity-70 flex items-center justify-end gap-1">
                        <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        {m.direction === "outbound" && status === "sent" && <Check className="h-3 w-3" />}
                        {m.direction === "outbound" && status === "delivered" && <CheckCheck className="h-3 w-3" />}
                        {m.direction === "outbound" && status === "read" && <CheckCheck className="h-3 w-3 text-info" />}
                        {m.direction === "outbound" && status === "failed" && (
                          <span title={err ?? "Falha no envio"} className="inline-flex items-center gap-0.5 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-3 flex gap-2 shrink-0">
              <Input
                value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Digite uma mensagem..."
                disabled={sending}
              />
              <Button onClick={sendMessage} disabled={sending} className="gradient-brand text-primary-foreground border-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
