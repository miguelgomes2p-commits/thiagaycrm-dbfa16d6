import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useServerFn } from "@tanstack/react-start";
import {
  sendWhatsappMessage,
  sendWhatsappAttachment,
  repairWhatsappAudioMedia,
  takeConversation,
  releaseConversation,
  resolveConversation,
} from "@/lib/whatsapp.functions";
import { useLabels, useConversationLabels, useAssignLabel, useRemoveLabel } from "@/hooks/useLabels";
import { LabelBadge } from "@/components/labels/LabelBadge";
import { LabelPicker } from "@/components/labels/LabelPicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Send, Search, Phone, Instagram, Facebook, Mail, Globe,
  Check, CheckCheck, AlertTriangle, UserPlus, UserMinus, CheckCircle2,
  Tag, Filter, ChevronRight, Paperclip, BriefcaseBusiness, Save, Loader2,
  Mic, Square, PanelRightOpen, PanelRightClose, X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { AudioPlayer } from "@/components/chat/AudioPlayer";

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
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState(loadView);
  const [labelPaneOpen, setLabelPaneOpen] = useState(true);
  const [leadTitle, setLeadTitle] = useState("");
  const [leadValue, setLeadValue] = useState("");
  const [leadPriority, setLeadPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [leadNotes, setLeadNotes] = useState("");
  const [leadFields, setLeadFields] = useState<Record<string, string>>({});
  const [leadPaneOpen, setLeadPaneOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const repairingAudioRef = useRef(new Set<string>());
  const qc = useQueryClient();
  const sendWa = useServerFn(sendWhatsappMessage);
  const sendWaFile = useServerFn(sendWhatsappAttachment);
  const repairAudio = useServerFn(repairWhatsappAudioMedia);
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

  const leadContextQ = useQuery({
    enabled: !!ws?.id && !!active,
    queryKey: ["conversation-lead-context", ws?.id, active?.id, (active as { lead_id?: string | null } | undefined)?.lead_id],
    queryFn: async () => {
      const leadId = (active as { lead_id?: string | null } | undefined)?.lead_id ?? null;
      const [{ data: pipes }, { data: lead }] = await Promise.all([
        supabase.from("pipelines").select("id, name").eq("workspace_id", ws!.id).order("position").limit(1),
        leadId
          ? supabase.from("leads").select("id, title, value, priority, notes, stage_id, pipeline_id").eq("id", leadId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const pipe = pipes?.[0] ?? null;
      const { data: stages } = pipe
        ? await supabase.from("pipeline_stages").select("id, name, position").eq("pipeline_id", pipe.id).order("position")
        : { data: [] };
      return { pipe, stages: stages ?? [], lead: lead as { id: string; title: string; value: number | null; priority: "low" | "medium" | "high" | "urgent"; notes?: string | null; stage_id: string; pipeline_id: string } | null };
    },
  });

  useEffect(() => {
    const lead = leadContextQ.data?.lead;
    const contactName = (active?.contacts as { name?: string } | null)?.name ?? "Lead WhatsApp";
    setLeadTitle(lead?.title ?? contactName);
    setLeadValue(lead?.value ? String(lead.value) : "");
    setLeadPriority(lead?.priority ?? "medium");
    setLeadNotes(lead?.notes ?? "");
  }, [leadContextQ.data?.lead, active?.id, active?.contacts]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgsQ.data]);

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!activeId || !msgsQ.data || repairingAudioRef.current.has(activeId)) return;
    const needsRepair = msgsQ.data.some((m) => {
      const mediaUrl = (m as { media_url?: string | null }).media_url;
      const mediaType = (m as { media_type?: string | null }).media_type;
      const content = (m.content ?? "").toLowerCase();
      return !mediaUrl && (mediaType === "audio" || content.includes("áudio") || content.includes("audio"));
    });
    if (!needsRepair) return;
    repairingAudioRef.current.add(activeId);
    repairAudio({ data: { conversationId: activeId } })
      .then((result) => {
        if (result.repaired > 0) {
          qc.invalidateQueries({ queryKey: ["messages", activeId] });
          toast.success(`${result.repaired} áudio(s) recuperado(s)`);
        }
      })
      .catch(() => undefined);
  }, [activeId, msgsQ.data, qc, repairAudio]);

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
    const isWa = active.channel === "whatsapp";
    const activeIdLocal = active.id;
    const wsId = ws.id;
    setText("");
    setSending(true);

    // Optimistic message
    const tempId = `temp-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const optimistic = {
      id: tempId,
      workspace_id: wsId,
      conversation_id: activeIdLocal,
      direction: "outbound",
      sender_type: "user",
      content,
      created_at: nowIso,
      delivery_status: "sending",
      _optimistic: true,
    } as unknown as Record<string, unknown>;
    const msgsKey = ["messages", activeIdLocal];
    const prevMsgs = qc.getQueryData<Record<string, unknown>[]>(msgsKey);
    qc.setQueryData<Record<string, unknown>[]>(msgsKey, [...(prevMsgs ?? []), optimistic]);
    // Optimistic conversation preview + reorder
    const convsKey = ["conversations", wsId];
    const prevConvs = qc.getQueryData<Record<string, unknown>[]>(convsKey);
    if (prevConvs) {
      const updated = prevConvs.map((c) =>
        (c as { id: string }).id === activeIdLocal
          ? { ...c, last_message_preview: content.slice(0, 200), last_message_at: nowIso }
          : c,
      );
      updated.sort((a, b) => {
        const ta = new Date((a as { last_message_at?: string }).last_message_at ?? 0).getTime();
        const tb = new Date((b as { last_message_at?: string }).last_message_at ?? 0).getTime();
        return tb - ta;
      });
      qc.setQueryData(convsKey, updated);
    }

    try {
      if (isWa) {
        await sendWa({ data: { conversationId: activeIdLocal, body: content } });
      } else {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("messages").insert({
          workspace_id: wsId, conversation_id: activeIdLocal, direction: "outbound", sender_type: "user",
          sender_user_id: u.user?.id, content,
        });
        await supabase.from("conversations").update({
          last_message_preview: content, last_message_at: nowIso,
        }).eq("id", activeIdLocal);
      }
      qc.invalidateQueries({ queryKey: msgsKey });
      qc.invalidateQueries({ queryKey: convsKey });
    } catch (e) {
      // Roll back optimistic entry
      qc.setQueryData<Record<string, unknown>[]>(msgsKey, (cur) =>
        (cur ?? []).filter((m) => (m as { id: string }).id !== tempId),
      );
      if (prevConvs) qc.setQueryData(convsKey, prevConvs);
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
      setText(content);
    } finally { setSending(false); }
  }

  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? "").split(",").pop() ?? "");
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }

  async function sendAttachment(file: File | undefined) {
    if (!file || !active || !ws) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Use até 16 MB.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await sendWaFile({ data: {
        conversationId: active.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64,
        caption: text.trim() || null,
      }});
      setText("");
      qc.invalidateQueries({ queryKey: ["messages", active.id] });
      qc.invalidateQueries({ queryKey: ["conversations", ws.id] });
      toast.success("Anexo enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar anexo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function preferredAudioMime() {
    const options = [
      "audio/ogg;codecs=opus",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    return options.find((mime) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) ?? "";
  }

  function stopRecordingTracks() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
  }

  async function startAudioRecording() {
    if (!active || sending || uploading || isRecording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Gravação de áudio não é suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type });
        recordingChunksRef.current = [];
        if (blob.size > 0) {
          const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
          void sendAttachment(new File([blob], `audio-${Date.now()}.${ext}`, { type }));
        }
        stopRecordingTracks();
      };
      recorder.start(500);
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (e) {
      stopRecordingTracks();
      toast.error(e instanceof Error && e.name === "NotAllowedError" ? "Permita o microfone para gravar áudio." : "Não foi possível iniciar a gravação.");
    }
  }

  function finishAudioRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopRecordingTracks();
    }
  }

  function cancelAudioRecording() {
    recordingChunksRef.current = [];
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = stopRecordingTracks;
      recorder.stop();
    } else {
      stopRecordingTracks();
    }
  }

  function formatRecordingTime(seconds: number) {
    const min = Math.floor(seconds / 60).toString().padStart(2, "0");
    const sec = (seconds % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  }

  async function saveLead() {
    if (!active || !ws || !leadContextQ.data?.pipe || !leadContextQ.data.stages[0]) return;
    const contactId = (active as { contact_id?: string | null }).contact_id ?? null;
    const lead = leadContextQ.data.lead;
    const payload = {
      title: leadTitle.trim() || ((active.contacts as { name?: string } | null)?.name ?? "Lead WhatsApp"),
      value: Number(leadValue || 0),
      priority: leadPriority,
      notes: leadNotes.trim() || null,
      last_interaction_at: new Date().toISOString(),
    };
    try {
      if (lead) {
        const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
        if (error) throw error;
      } else {
        const { data: user } = await supabase.auth.getUser();
        const { data: created, error } = await supabase.from("leads").insert({
          workspace_id: ws.id,
          pipeline_id: leadContextQ.data.pipe.id,
          stage_id: leadContextQ.data.stages[0].id,
          contact_id: contactId,
          owner_id: user.user?.id,
          source: "WhatsApp",
          ...payload,
        }).select("id").single();
        if (error) throw error;
        await supabase.from("conversations").update({ lead_id: created?.id }).eq("id", active.id);
      }
      toast.success("Lead salvo");
      qc.invalidateQueries({ queryKey: ["conversation-lead-context"] });
      qc.invalidateQueries({ queryKey: ["conversations", ws.id] });
      qc.invalidateQueries({ queryKey: ["pipeline", ws.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar lead");
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
                const contact = c.contacts as { name?: string; type?: string; avatar_url?: string | null } | null;
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
                      {contact?.avatar_url && <AvatarImage src={contact.avatar_url} alt={name} />}
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
                {(active.contacts as { avatar_url?: string | null } | null)?.avatar_url && (
                  <AvatarImage src={(active.contacts as { avatar_url?: string | null }).avatar_url!} />
                )}
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
                <Button
                  size="sm"
                  variant={leadPaneOpen ? "outline" : "ghost"}
                  className="h-8 gap-1.5"
                  onClick={() => setLeadPaneOpen((v) => !v)}
                  title={leadPaneOpen ? "Fechar anotações" : "Abrir anotações"}
                >
                  {leadPaneOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                  Lead
                </Button>
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
                const mediaUrl = (m as { media_url?: string | null }).media_url;
                const mediaType = (m as { media_type?: string | null }).media_type;
                const mediaMime = (m as { media_mime_type?: string | null }).media_mime_type;
                return (
                  <div key={m.id} className={cn("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-md rounded-2xl px-3 py-2 text-sm space-y-2",
                      m.direction === "outbound"
                        ? "gradient-brand text-primary-foreground rounded-br-sm"
                        : m.sender_type === "ai"
                          ? "bg-accent/20 text-accent-foreground border border-accent/30 rounded-bl-sm"
                          : "bg-surface border border-border rounded-bl-sm"
                    )}>
                      {mediaUrl && (mediaType === "image" || mediaType === "sticker") && (
                        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={mediaUrl}
                            alt={m.content ?? "imagem"}
                            className={cn(
                              "rounded-lg max-h-72 w-auto object-cover",
                              mediaType === "sticker" && "max-h-32 bg-white/5",
                            )}
                          />
                        </a>
                      )}
                      {mediaUrl && mediaType === "audio" && (
                        <AudioPlayer
                          src={mediaUrl}
                          mime={mediaMime}
                          variant={m.direction === "outbound" ? "dark" : "light"}
                        />
                      )}
                      {mediaUrl && mediaType === "video" && (
                        <video controls src={mediaUrl} className="rounded-lg max-h-72 w-full" />
                      )}
                      {mediaUrl && mediaType === "document" && (
                        <a
                          href={mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/20 hover:bg-black/30 text-xs"
                        >
                          <span className="text-base">📎</span>
                          <span className="truncate">{m.content?.replace(/^📎\s*/, "") ?? "documento"}</span>
                          <span className="opacity-60 text-[10px]">{mediaMime?.split("/")[1]?.toUpperCase()}</span>
                        </a>
                      )}
                      {m.content && !(mediaType === "document" && m.content?.startsWith("📎")) && (
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      )}
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
            <div className="border-t border-border p-3 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                onChange={(e) => sendAttachment(e.target.files?.[0])}
              />
              {isRecording ? (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-2">
                  <Button type="button" variant="ghost" size="icon" onClick={cancelAudioRecording} title="Cancelar gravação">
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-1 items-center gap-2 text-sm text-destructive">
                    <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
                    <span className="font-medium">Gravando áudio</span>
                    <span className="font-mono text-xs">{formatRecordingTime(recordingSeconds)}</span>
                  </div>
                  <Button type="button" onClick={finishAudioRecording} className="gradient-brand text-primary-foreground border-0" title="Enviar áudio">
                    <Square className="h-4 w-4 mr-1" /> Enviar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={sending || uploading}
                    onClick={() => fileInputRef.current?.click()}
                    title="Anexar arquivo"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={sending || uploading || !active}
                    onClick={startAudioRecording}
                    title="Gravar áudio"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Input
                    value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Digite uma mensagem..."
                    disabled={sending || uploading}
                  />
                  <Button onClick={sendMessage} disabled={sending || uploading} className="gradient-brand text-primary-foreground border-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {active && leadPaneOpen && (
        <aside className="w-80 border-l border-border bg-surface/20 p-4 overflow-y-auto shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <BriefcaseBusiness className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Lead</h2>
              <p className="text-[11px] text-muted-foreground">Informações comerciais da conversa</p>
            </div>
          </div>
          {!leadContextQ.data?.pipe || !leadContextQ.data.stages[0] ? (
            <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
              Crie um pipeline antes de salvar leads.
            </div>
          ) : (
            <div className="space-y-3">
              {leadContextQ.data.lead && (
                <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                  Lead vinculado ao pipeline.
                </div>
              )}
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Valor</Label>
                  <Input value={leadValue} onChange={(e) => setLeadValue(e.target.value)} type="number" step="0.01" className="h-8 text-xs" placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={leadPriority} onValueChange={(v) => setLeadPriority(v as typeof leadPriority)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Informações do lead</Label>
                <Textarea
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                  className="min-h-36 text-xs resize-none"
                  placeholder="Necessidade, orçamento, prazo, objeções, próximos passos..."
                />
              </div>
              <Button onClick={saveLead} className="w-full gradient-brand text-primary-foreground border-0">
                <Save className="h-4 w-4 mr-1" /> Salvar lead
              </Button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
