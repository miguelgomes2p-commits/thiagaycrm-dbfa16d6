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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Send, Search, Phone, Instagram, Facebook, Mail, Globe,
  Check, CheckCheck, AlertTriangle, UserPlus, UserMinus, CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/conversations")({
  component: ConversationsPage,
});


const channelIcon = { whatsapp: Phone, instagram: Instagram, facebook: Facebook, email: Mail, webchat: Globe, telegram: Send, sms: Phone } as const;

function ConversationsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const sendWa = useServerFn(sendWhatsappMessage);
  const takeFn = useServerFn(takeConversation);
  const releaseFn = useServerFn(releaseConversation);
  const resolveFn = useServerFn(resolveConversation);

  const convsQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["conversations", ws?.id],
    queryFn: async () => {
      const { data } = await supabase.from("conversations")
        .select("*, contacts:contact_id(name)")
        .eq("workspace_id", ws!.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50);
      return data ?? [];
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

  // Realtime for active conversation messages
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase.channel(`msgs-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", activeId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, qc]);

  // Realtime for conversation list (new WhatsApp conversations landing on the workspace)
  useEffect(() => {
    if (!ws?.id) return;
    const ch = supabase.channel(`convs-${ws.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${ws.id}` },
        () => qc.invalidateQueries({ queryKey: ["conversations", ws.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ws?.id, qc]);

  const active = useMemo(() => convsQ.data?.find((c) => c.id === activeId), [convsQ.data, activeId]);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgsQ.data]);

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
    } finally {
      setSending(false);
    }
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


  return (
    <div className="h-full flex">
      {/* List */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h1 className="font-semibold">Conversas</h1>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9 h-9" />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Conversas WhatsApp aparecem aqui automaticamente ao receber mensagens.
          </div>

        </div>
        <div className="flex-1 overflow-y-auto">
          {convsQ.data?.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nenhuma conversa ainda.
            </div>
          )}
          {convsQ.data?.map((c) => {
            const Icon = channelIcon[c.channel as keyof typeof channelIcon] ?? MessageSquare;
            const name = (c.contacts as { name?: string } | null)?.name ?? "Anônimo";
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "w-full text-left p-3 border-b border-border hover:bg-surface/50 transition-colors flex gap-3",
                  activeId === c.id && "bg-surface"
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{name}</span>
                    {c.last_message_at && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(c.last_message_at), { locale: ptBR, addSuffix: false })}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.last_message_preview ?? "—"}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Icon className="h-3 w-3" /> {c.channel}
                  </div>
                </div>
              </button>
            );
          })}
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
                <div className="text-xs text-muted-foreground">{active.channel} · {active.status}</div>
              </div>
              <div className="flex items-center gap-1">
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
