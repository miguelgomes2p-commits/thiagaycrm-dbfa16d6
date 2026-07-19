import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import {
  listWhatsappNumbers,
  connectWhatsappNumber,
  deleteWhatsappNumber,
  toggleAutoReply,
  syncWhatsappTemplates,
  listWhatsappTemplates,
  sendWhatsappTemplate,
} from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsappSetupWizard } from "@/components/whatsapp/SetupWizard";
import {
  Phone,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Send,
  ExternalLink,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/whatsapp")({
  component: WhatsappPage,
});

function WhatsappPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const qc = useQueryClient();

  const list = useServerFn(listWhatsappNumbers);
  const connect = useServerFn(connectWhatsappNumber);
  const remove = useServerFn(deleteWhatsappNumber);
  const toggle = useServerFn(toggleAutoReply);
  const syncTpls = useServerFn(syncWhatsappTemplates);
  const listTpls = useServerFn(listWhatsappTemplates);
  const sendTpl = useServerFn(sendWhatsappTemplate);

  const numbersQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["wa-numbers", ws?.id],
    queryFn: () => list({ data: { workspaceId: ws!.id } }),
  });

  const templatesQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["wa-templates", ws?.id],
    queryFn: () => listTpls({ data: { workspaceId: ws!.id } }),
  });

  const [openConnect, setOpenConnect] = useState(false);
  const [openWizard, setOpenWizard] = useState(false);
  const [openSend, setOpenSend] = useState(false);

  const connectM = useMutation({
    mutationFn: (values: {
      label: string;
      displayNumber: string;
      phoneNumberId: string;
      wabaId: string;
      appId?: string;
      accessToken: string;
    }) => connect({ data: { workspaceId: ws!.id, ...values } }),
    onSuccess: () => {
      toast.success("Número conectado");
      qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] });
      setOpenConnect(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Número removido");
      qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; enabled: boolean; prompt?: string }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const syncM = useMutation({
    mutationFn: (whatsappNumberId: string) => syncTpls({ data: { whatsappNumberId } }),
    onSuccess: (r) => {
      toast.success(`${r.count} templates sincronizados`);
      qc.invalidateQueries({ queryKey: ["wa-templates", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendM = useMutation({
    mutationFn: (v: { whatsappNumberId: string; to: string; templateName: string; language: string }) =>
      sendTpl({ data: { workspaceId: ws!.id, ...v } }),
    onSuccess: () => {
      toast.success("Template enviado");
      setOpenSend(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Meta não consegue validar o webhook no domínio de preview (protegido por auth do Lovable).
  // Usamos sempre o domínio publicado quando estamos em preview/localhost.
  const origin = (() => {
    if (typeof window === "undefined") return "https://thiagaycrm.lovable.app";
    const host = window.location.host;
    const isPreview =
      host.includes("id-preview--") ||
      host.includes("lovableproject.com") ||
      host.includes("localhost") ||
      host.includes("127.0.0.1");
    return isPreview ? "https://thiagaycrm.lovable.app" : window.location.origin;
  })();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Business</h1>
          <p className="text-sm text-muted-foreground">Conecte múltiplos números, ative auto-resposta com IA e envie templates.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setOpenWizard(true)}>
            <Rocket className="h-4 w-4 mr-1" /> Guia passo a passo
          </Button>
          <Dialog open={openConnect} onOpenChange={setOpenConnect}>
            <DialogTrigger asChild>
              <Button className="gradient-brand text-primary-foreground border-0">
                <Plus className="h-4 w-4 mr-1" /> Conectar número
              </Button>
            </DialogTrigger>
            <ConnectDialog onSubmit={(v) => connectM.mutate(v)} loading={connectM.isPending} />
          </Dialog>
        </div>
      </div>

      <WhatsappSetupWizard
        open={openWizard}
        onOpenChange={setOpenWizard}
        webhookUrl={numbersQ.data?.[0] ? `${origin}/api/public/webhooks/whatsapp/${numbersQ.data[0].id}` : undefined}
        verifyToken={numbersQ.data?.[0]?.webhook_verify_token}
        onConnect={(v) => connectM.mutate(v)}
        connecting={connectM.isPending}
      />

      {/* Numbers */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Números conectados</h2>
        {numbersQ.isLoading && <div className="card-elevated p-6 text-sm text-muted-foreground">Carregando…</div>}
        {numbersQ.data?.length === 0 && (
          <div className="card-elevated p-8 text-center">
            <Phone className="h-8 w-8 mx-auto text-muted-foreground opacity-40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum número conectado ainda.</p>
          </div>
        )}
        <div className="grid gap-3">
          {numbersQ.data?.map((n) => {
            const webhookUrl = `${origin}/api/public/webhooks/whatsapp/${n.id}`;
            const active = !!n.last_webhook_at;
            return (
              <div key={n.id} className="card-elevated p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", active ? "bg-success" : "bg-muted")} />
                      <span className="font-semibold">{n.label}</span>
                      <span className="text-sm text-muted-foreground">· {n.display_number}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground font-mono">phone_number_id: {n.phone_number_id}</div>
                    {n.last_webhook_at ? (
                      <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Último webhook há{" "}
                        {formatDistanceToNow(new Date(n.last_webhook_at), { locale: ptBR, addSuffix: false })}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-warning inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Nenhum webhook recebido — configure o callback no painel Meta
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => syncM.mutate(n.id)} disabled={syncM.isPending}>
                      <RefreshCw className={cn("h-4 w-4 mr-1", syncM.isPending && "animate-spin")} /> Templates
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeM.mutate(n.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <CopyField label="Callback URL (Webhook)" value={webhookUrl} />
                  <CopyField label="Verify Token" value={n.webhook_verify_token} mono />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Auto-resposta com IA</div>
                      <div className="text-xs text-muted-foreground">
                        Responde automaticamente novas mensagens até um agente assumir.
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={n.auto_reply_enabled}
                    onCheckedChange={(v) => toggleM.mutate({ id: n.id, enabled: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Templates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Templates aprovados ({templatesQ.data?.length ?? 0})
          </h2>
          <Dialog open={openSend} onOpenChange={setOpenSend}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!templatesQ.data?.length}>
                <Send className="h-4 w-4 mr-1" /> Enviar template
              </Button>
            </DialogTrigger>
            <SendTemplateDialog
              numbers={numbersQ.data ?? []}
              templates={templatesQ.data ?? []}
              onSubmit={(v) => sendM.mutate(v)}
              loading={sendM.isPending}
            />
          </Dialog>
        </div>
        {templatesQ.data?.length === 0 && (
          <div className="card-elevated p-6 text-sm text-muted-foreground">
            Nenhum template sincronizado. Clique em "Templates" no card do número.
          </div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {templatesQ.data?.map((t) => (
            <div key={t.id} className="card-elevated p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm truncate">{t.name}</div>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    t.status === "approved"
                      ? "bg-success/20 text-success"
                      : t.status === "rejected"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t.language} · {t.category ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Setup help */}
      <section className="card-elevated p-5 text-sm">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <ExternalLink className="h-4 w-4 text-primary" /> Como configurar no Meta
        </div>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Após conectar o número acima, copie a <strong>Callback URL</strong> e o <strong>Verify Token</strong>.</li>
          <li>
            No <a className="underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers</a>,
            abra seu App → WhatsApp → Configuration → Webhooks.
          </li>
          <li>Cole a Callback URL e o Verify Token, clique em <em>Verify and save</em>.</li>
          <li>Assine o campo <strong>messages</strong>.</li>
          <li>Pronto — mensagens entrarão na fila automaticamente.</li>
        </ol>
      </section>
    </div>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 flex gap-1">
        <Input readOnly value={value} className={cn("h-9 text-xs", mono && "font-mono")} />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success("Copiado");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ConnectDialog({
  onSubmit,
  loading,
}: {
  onSubmit: (v: {
    label: string;
    displayNumber: string;
    phoneNumberId: string;
    wabaId: string;
    appId?: string;
    accessToken: string;
  }) => void;
  loading: boolean;
}) {
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Conectar número WhatsApp</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSubmit({
            label: String(fd.get("label")),
            displayNumber: String(fd.get("displayNumber")),
            phoneNumberId: String(fd.get("phoneNumberId")),
            wabaId: String(fd.get("wabaId")),
            appId: String(fd.get("appId") || "") || undefined,
            accessToken: String(fd.get("accessToken")),
          });
        }}
      >
        <div>
          <Label>Rótulo interno *</Label>
          <Input name="label" required placeholder="Ex: Vendas Brasil" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Número (exibição) *</Label>
            <Input name="displayNumber" required placeholder="+55 11 91234-5678" />
          </div>
          <div>
            <Label>App ID (opcional)</Label>
            <Input name="appId" placeholder="123..." />
          </div>
        </div>
        <div>
          <Label>Phone Number ID *</Label>
          <Input name="phoneNumberId" required placeholder="123456789012345" className="font-mono text-xs" />
        </div>
        <div>
          <Label>WABA ID *</Label>
          <Input name="wabaId" required placeholder="987654321098765" className="font-mono text-xs" />
        </div>
        <div>
          <Label>Access Token (permanente) *</Label>
          <Textarea
            name="accessToken"
            required
            placeholder="EAAG..."
            rows={3}
            className="font-mono text-xs resize-none"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full gradient-brand text-primary-foreground border-0">
          {loading ? "Validando com Meta…" : "Conectar"}
        </Button>
      </form>
    </DialogContent>
  );
}

function SendTemplateDialog({
  numbers,
  templates,
  onSubmit,
  loading,
}: {
  numbers: Array<{ id: string; label: string; display_number: string }>;
  templates: Array<{ id: string; name: string; language: string; whatsapp_number_id: string; status: string }>;
  onSubmit: (v: { whatsappNumberId: string; to: string; templateName: string; language: string }) => void;
  loading: boolean;
}) {
  const [numberId, setNumberId] = useState<string>(numbers[0]?.id ?? "");
  const [templateId, setTemplateId] = useState<string>("");
  const available = templates.filter((t) => t.whatsapp_number_id === numberId && t.status === "approved");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Enviar template</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const tpl = available.find((t) => t.id === templateId);
          if (!tpl) {
            toast.error("Selecione um template");
            return;
          }
          onSubmit({
            whatsappNumberId: numberId,
            to: String(fd.get("to")),
            templateName: tpl.name,
            language: tpl.language,
          });
        }}
      >
        <div>
          <Label>Número de origem</Label>
          <Select value={numberId} onValueChange={setNumberId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {numbers.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label} — {n.display_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um template aprovado" />
            </SelectTrigger>
            <SelectContent>
              {available.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Destinatário (E.164 sem "+")</Label>
          <Input name="to" required placeholder="5511912345678" />
        </div>
        <Button type="submit" disabled={loading || !templateId} className="w-full gradient-brand text-primary-foreground border-0">
          {loading ? "Enviando…" : "Enviar"}
        </Button>
      </form>
    </DialogContent>
  );
}
