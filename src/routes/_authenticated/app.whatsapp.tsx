import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import {
  listWhatsappNumbers,
  connectWhatsappNumber,
  deleteWhatsappNumber,
  toggleAutoReply,
  syncWhatsappTemplates,
  subscribeWhatsappWebhook,
  listWhatsappTemplates,
  sendWhatsappTemplate,
} from "@/lib/whatsapp.functions";
import {
  createEvolutionInstance,
  refreshEvolutionQr,
  checkEvolutionStatus,
  logoutEvolutionInstance,
} from "@/lib/evolution.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  BellRing,
  Send,
  ExternalLink,
  Rocket,
  QrCode,
  Loader2,
  LogOut,
  Smartphone,
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
  const subscribeWebhook = useServerFn(subscribeWhatsappWebhook);
  const listTpls = useServerFn(listWhatsappTemplates);
  const sendTpl = useServerFn(sendWhatsappTemplate);
  const createEvo = useServerFn(createEvolutionInstance);
  const refreshQr = useServerFn(refreshEvolutionQr);
  const checkStatus = useServerFn(checkEvolutionStatus);
  const logoutEvo = useServerFn(logoutEvolutionInstance);

  const numbersQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["wa-numbers", ws?.id],
    queryFn: () => list({ data: { workspaceId: ws!.id } }),
    refetchInterval: 15000,
  });

  const templatesQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["wa-templates", ws?.id],
    queryFn: () => listTpls({ data: { workspaceId: ws!.id } }),
  });

  const [openConnect, setOpenConnect] = useState(false);
  const [openEvo, setOpenEvo] = useState(false);
  const [openWizard, setOpenWizard] = useState(false);
  const [openSend, setOpenSend] = useState(false);
  const [qrModal, setQrModal] = useState<{ id: string; qr: string | null } | null>(null);

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

  const subscribeM = useMutation({
    mutationFn: (whatsappNumberId: string) => subscribeWebhook({ data: { whatsappNumberId } }),
    onSuccess: (r) => {
      if (r.messagesSubscribed) toast.success("WABA assinada para receber messages");
      else toast.warning("Assinatura enviada; confirme o campo messages na Meta");
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

  // Domínio publicado — Meta e serviços externos precisam de URL pública.
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

  const createEvoM = useMutation({
    mutationFn: (v: { label: string; displayNumber: string; baseUrl: string; apiKey: string; instanceName: string }) =>
      createEvo({ data: { workspaceId: ws!.id, webhookOrigin: origin, ...v } }),
    onSuccess: (r) => {
      toast.success("Instância criada — escaneie o QR Code");
      qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] });
      setOpenEvo(false);
      setQrModal({ id: r.id, qr: r.qr });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshQrM = useMutation({
    mutationFn: (id: string) => refreshQr({ data: { id } }),
    onSuccess: (r, id) => {
      setQrModal({ id, qr: r.qr });
      qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkStatusM = useMutation({
    mutationFn: (id: string) => checkStatus({ data: { id } }),
    onSuccess: (r) => {
      toast.info(`Estado: ${r.mapped}`);
      qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logoutEvoM = useMutation({
    mutationFn: (id: string) => logoutEvo({ data: { id } }),
    onSuccess: () => {
      toast.success("Sessão encerrada");
      qc.invalidateQueries({ queryKey: ["wa-numbers", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Business</h1>
          <p className="text-sm text-muted-foreground">
            Conecte múltiplos números: oficial via Cloud API ou espelhado por QR Code (Evolution/Z-API).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setOpenWizard(true)}>
            <Rocket className="h-4 w-4 mr-1" /> Guia Meta Cloud
          </Button>
          <Dialog open={openEvo} onOpenChange={setOpenEvo}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <QrCode className="h-4 w-4 mr-1" /> Conectar por QR Code
              </Button>
            </DialogTrigger>
            <EvolutionConnectDialog onSubmit={(v) => createEvoM.mutate(v)} loading={createEvoM.isPending} />
          </Dialog>
          <Dialog open={openConnect} onOpenChange={setOpenConnect}>
            <DialogTrigger asChild>
              <Button className="gradient-brand text-primary-foreground border-0">
                <Plus className="h-4 w-4 mr-1" /> Cloud API oficial
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
        verifyToken={numbersQ.data?.[0]?.webhook_verify_token ?? undefined}
        onConnect={(v) => connectM.mutate(v)}
        connecting={connectM.isPending}
      />

      {/* QR Code modal */}
      <Dialog open={!!qrModal} onOpenChange={(o) => !o && setQrModal(null)}>
        <DialogContent className="max-w-md">
          <QrSyncContent
            qrModal={qrModal}
            currentStatus={numbersQ.data?.find((n) => n.id === qrModal?.id)?.connection_status ?? null}
            lastWebhookAt={numbersQ.data?.find((n) => n.id === qrModal?.id)?.last_webhook_at ?? null}
            onRefreshQr={() => qrModal && refreshQrM.mutate(qrModal.id)}
            refreshing={refreshQrM.isPending}
            onCheckStatus={() => qrModal && checkStatusM.mutate(qrModal.id)}
            checking={checkStatusM.isPending}
            onClose={() => setQrModal(null)}
          />
        </DialogContent>
      </Dialog>

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
            const webhookUrl =
              n.provider === "evolution"
                ? `${origin}/api/public/webhooks/evolution/${n.id}`
                : `${origin}/api/public/webhooks/whatsapp/${n.id}`;
            const active = !!n.last_webhook_at;
            const isEvo = n.provider === "evolution";
            const statusColor =
              n.connection_status === "connected"
                ? "bg-success"
                : n.connection_status === "qr" || n.connection_status === "connecting"
                  ? "bg-warning"
                  : n.connection_status === "error"
                    ? "bg-destructive"
                    : active
                      ? "bg-success"
                      : "bg-muted";
            return (
              <div key={n.id} className="card-elevated p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("h-2 w-2 rounded-full", statusColor)} />
                      <span className="font-semibold">{n.label}</span>
                      <span className="text-sm text-muted-foreground">· {n.display_number}</span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          isEvo ? "bg-primary/15 text-primary" : "bg-success/15 text-success",
                        )}
                      >
                        {isEvo ? (
                          <span className="inline-flex items-center gap-1">
                            <Smartphone className="h-3 w-3" /> QR Code (espelhado)
                          </span>
                        ) : (
                          "Cloud API oficial"
                        )}
                      </span>
                      {isEvo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {n.connection_status}
                        </span>
                      )}
                    </div>
                    {!isEvo && n.phone_number_id && (
                      <div className="mt-1 text-xs text-muted-foreground font-mono">phone_number_id: {n.phone_number_id}</div>
                    )}
                    {isEvo && n.instance_name && (
                      <div className="mt-1 text-xs text-muted-foreground font-mono">instância: {n.instance_name}</div>
                    )}
                    {n.last_webhook_at ? (
                      <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-success" /> Último evento há{" "}
                        {formatDistanceToNow(new Date(n.last_webhook_at), { locale: ptBR, addSuffix: false })}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-warning inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />{" "}
                        {isEvo ? "Aguardando escaneamento do QR" : "Nenhum webhook recebido — configure na Meta"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isEvo ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setQrModal({ id: n.id, qr: null });
                            refreshQrM.mutate(n.id);
                          }}
                        >
                          <QrCode className="h-4 w-4 mr-1" /> QR
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => checkStatusM.mutate(n.id)}
                          disabled={checkStatusM.isPending}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" /> Status
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => logoutEvoM.mutate(n.id)}
                          disabled={logoutEvoM.isPending}
                        >
                          <LogOut className="h-4 w-4 mr-1" /> Logout
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => subscribeM.mutate(n.id)} disabled={subscribeM.isPending}>
                          <BellRing className="h-4 w-4 mr-1" /> Assinar WABA
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => syncM.mutate(n.id)} disabled={syncM.isPending}>
                          <RefreshCw className={cn("h-4 w-4 mr-1", syncM.isPending && "animate-spin")} /> Templates
                        </Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => removeM.mutate(n.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {!isEvo && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <CopyField label="Callback URL (Webhook)" value={webhookUrl} />
                    <CopyField label="Verify Token" value={n.webhook_verify_token ?? "Disponível apenas para admins"} mono />
                  </div>
                )}
                {isEvo && (
                  <div>
                    <CopyField label="Webhook Evolution (já configurado na criação)" value={webhookUrl} />
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Auto-resposta com IA</div>
                      <div className="text-xs text-muted-foreground">
                        {isEvo
                          ? "Disponível apenas em Cloud API oficial nesta versão."
                          : "Responde automaticamente novas mensagens até um agente assumir."}
                      </div>
                    </div>
                  </div>
                  <Switch
                    disabled={isEvo}
                    checked={n.auto_reply_enabled}
                    onCheckedChange={(v) => toggleM.mutate({ id: n.id, enabled: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Templates (Cloud API only) */}
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
              numbers={(numbersQ.data ?? []).filter((n) => n.provider !== "evolution")}
              templates={templatesQ.data ?? []}
              onSubmit={(v) => sendM.mutate(v)}
              loading={sendM.isPending}
            />
          </Dialog>
        </div>
        {templatesQ.data?.length === 0 && (
          <div className="card-elevated p-6 text-sm text-muted-foreground">
            Templates existem apenas em números Cloud API oficial (Meta).
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
          <ExternalLink className="h-4 w-4 text-primary" /> Sobre os dois modos
        </div>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <strong>Cloud API oficial:</strong> aprovado pela Meta, sem risco de banimento, mas o número não pode ficar
            no app do celular. Suporta templates e auto-resposta com IA.
          </li>
          <li>
            <strong>QR Code (Evolution/Z-API):</strong> espelha o número via WhatsApp Web, celular continua ligado. Use
            Evolution API (self-hosted grátis) ou Z-API (SaaS). Cole a URL e a API key do servidor no botão acima.
          </li>
        </ul>
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

function EvolutionConnectDialog({
  onSubmit,
  loading,
}: {
  onSubmit: (v: {
    label: string;
    displayNumber: string;
    baseUrl: string;
    apiKey: string;
    instanceName: string;
  }) => void;
  loading: boolean;
}) {
  const [instanceName, setInstanceName] = useState(`lupus_${Math.random().toString(36).slice(2, 8)}`);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Conectar via QR Code (Evolution / Z-API)</DialogTitle>
        <DialogDescription>
          Aponte para um servidor Evolution API v2 (self-hosted) ou compatível. Se ainda não tem, veja instruções
          abaixo.
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSubmit({
            label: String(fd.get("label")),
            displayNumber: String(fd.get("displayNumber")),
            baseUrl: String(fd.get("baseUrl")).trim(),
            apiKey: String(fd.get("apiKey")).trim(),
            instanceName,
          });
        }}
      >
        <div>
          <Label>Rótulo interno *</Label>
          <Input name="label" required placeholder="Ex: Vendas Brasil" />
        </div>
        <div>
          <Label>Número (exibição) *</Label>
          <Input name="displayNumber" required placeholder="+55 11 91234-5678" />
        </div>
        <div>
          <Label>URL do servidor Evolution *</Label>
          <Input name="baseUrl" required placeholder="https://sua-evolution.up.railway.app" className="text-xs" />
        </div>
        <div>
          <Label>API Key global *</Label>
          <Input name="apiKey" required placeholder="AUTHENTICATION_API_KEY" className="font-mono text-xs" />
        </div>
        <div>
          <Label>Nome da instância</Label>
          <Input
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            className="font-mono text-xs"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full gradient-brand text-primary-foreground border-0">
          {loading ? "Criando instância…" : "Criar instância e gerar QR"}
        </Button>
        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          <p className="font-medium">Sem servidor Evolution ainda?</p>
          <p>
            Deploy grátis em 3 min:{" "}
            <a
              className="underline text-primary"
              href="https://doc.evolution-api.com/v2/pt/install/render"
              target="_blank"
              rel="noreferrer"
            >
              Guia oficial (Render/Railway)
            </a>
            . Copie o `AUTHENTICATION_API_KEY` do painel e a URL pública.
          </p>
        </div>
      </form>
    </DialogContent>
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
        <DialogTitle>Conectar número WhatsApp (Cloud API)</DialogTitle>
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
  useEffect(() => setTemplateId(""), [numberId]);
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
          const t = templates.find((x) => x.id === templateId);
          if (!t) return;
          onSubmit({
            whatsappNumberId: numberId,
            to: String(fd.get("to")).replace(/\D/g, ""),
            templateName: t.name,
            language: t.language,
          });
        }}
      >
        <div>
          <Label>Número</Label>
          <Select value={numberId} onValueChange={setNumberId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {numbers.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label} · {n.display_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
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
          <Label>Destinatário (E.164)</Label>
          <Input name="to" required placeholder="5511912345678" className="font-mono text-xs" />
        </div>
        <Button type="submit" disabled={loading || !templateId} className="w-full gradient-brand text-primary-foreground border-0">
          {loading ? "Enviando…" : "Enviar"}
        </Button>
      </form>
    </DialogContent>
  );
}

function QrSyncContent({
  qrModal,
  currentStatus,
  onRefreshQr,
  refreshing,
  onCheckStatus,
  checking,
  onClose,
}: {
  qrModal: { id: string; qr: string | null } | null;
  currentStatus: string | null;
  onRefreshQr: () => void;
  refreshing: boolean;
  onCheckStatus: () => void;
  checking: boolean;
  onClose: () => void;
}) {
  const checkStatus = useServerFn(checkEvolutionStatus);
  const [autoState, setAutoState] = useState<string | null>(null);
  const [scanConfirmed, setScanConfirmed] = useState(false);
  const [syncStart, setSyncStart] = useState<number | null>(null);
  const [syncElapsed, setSyncElapsed] = useState(0);
  const [qrShownAt, setQrShownAt] = useState<number | null>(null);

  useEffect(() => {
    setAutoState(null);
    setScanConfirmed(false);
    setSyncStart(null);
    setSyncElapsed(0);
    setQrShownAt(null);
  }, [qrModal?.id]);

  // Marca quando o QR foi efetivamente exibido para o usuário
  useEffect(() => {
    if (qrModal?.qr && qrShownAt === null) setQrShownAt(Date.now());
  }, [qrModal?.qr, qrShownAt]);

  // Só começa a consultar o estado depois que o usuário confirma que escaneou.
  // Isso evita pular o QR por causa de status/webhooks antigos da instância.
  useEffect(() => {
    if (!qrModal || !scanConfirmed) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await checkStatus({ data: { id: qrModal.id } });
        if (!cancelled) setAutoState(r.mapped);
      } catch { /* ignore transient errors */ }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [qrModal, scanConfirmed, checkStatus]);

  // Status efetivo: antes da confirmação manual, ignore qualquer estado salvo.
  const status = autoState ?? currentStatus ?? "qr";
  const qrWasShown = qrShownAt !== null;
  const phase: "qr" | "checking" | "syncing" | "connected" =
    !scanConfirmed || !qrWasShown
      ? "qr"
      : status === "connected"
      ? "connected"
      : status === "connecting"
        ? "syncing"
        : "checking";


  // Cronômetro de sincronização
  useEffect(() => {
    if (phase === "syncing" || phase === "checking") {
      if (syncStart === null) setSyncStart(Date.now());
    } else if (phase === "qr" && syncStart !== null) {
      setSyncStart(null);
      setSyncElapsed(0);
    }
  }, [phase, syncStart]);

  useEffect(() => {
    if ((phase !== "syncing" && phase !== "checking") || syncStart === null) return;
    const iv = setInterval(() => setSyncElapsed(Math.floor((Date.now() - syncStart) / 1000)), 500);
    return () => clearInterval(iv);
  }, [phase, syncStart]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {phase === "connected"
            ? "WhatsApp conectado!"
            : phase === "syncing"
              ? "Sincronizando conversas…"
              : phase === "checking"
                ? "Aguardando leitura do QR…"
              : "Escaneie no seu WhatsApp"}
        </DialogTitle>
        <DialogDescription>
          {phase === "connected"
            ? "Seu número está pronto para receber e enviar mensagens pelo CRM."
            : phase === "syncing"
              ? "O QR foi lido. Estamos baixando as conversas e contatos do seu WhatsApp — isso pode levar alguns minutos na primeira vez."
              : phase === "checking"
                ? "Ainda não detectamos uma conexão nova. Mantenha esta janela aberta e confirme no celular se o QR foi lido."
              : "WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho. O celular pode continuar usando normalmente."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-4">
        {phase === "qr" && (
          qrModal?.qr ? (
            <img src={qrModal.qr} alt="QR Code de conexão" className="w-64 h-64 rounded-lg bg-white p-2" />
          ) : (
            <div className="w-64 h-64 rounded-lg bg-muted flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )
        )}

        {(phase === "syncing" || phase === "checking") && (
          <div className="w-full flex flex-col items-center gap-4 py-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            </div>
            <div className="w-full space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 bg-primary animate-[slide_1.4s_ease-in-out_infinite]" style={{ animation: "wa-sync 1.4s ease-in-out infinite" }} />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {phase === "syncing" ? "Sincronizando" : "Verificando leitura"} há {syncElapsed}s · não feche esta janela
              </p>
            </div>
            <style>{`@keyframes wa-sync { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
          </div>
        )}

        {phase === "connected" && (
          <div className="w-full flex flex-col items-center gap-3 py-6">
            <div className="w-20 h-20 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <p className="text-sm font-medium">Conexão estabelecida com sucesso</p>
            <Button size="sm" onClick={onClose} className="gradient-brand text-primary-foreground border-0">
              Ir para conversas
            </Button>
          </div>
        )}

        {phase !== "connected" && (
          <div className="flex flex-wrap justify-center gap-2">
            {phase === "qr" && (
              <Button size="sm" onClick={() => setScanConfirmed(true)} disabled={!qrModal?.qr} className="gradient-brand text-primary-foreground border-0">
                <Smartphone className="h-4 w-4 mr-1" /> Já escaneei o QR
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onRefreshQr} disabled={refreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-1", refreshing && "animate-spin")} /> Novo QR
            </Button>
            <Button variant="outline" size="sm" onClick={onCheckStatus} disabled={checking}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Verificar agora
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
