import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import {
  getFiscalConfig, saveFiscalConfig, uploadFiscalCertificate, checkFiscalCertificate, confirmExternalCertificate, enableFiscalProduction,
  listFiscalProfiles, upsertFiscalProfile, deleteFiscalProfile,
  listFiscalDocuments, getFiscalDocumentLinks, syncFiscalDocument, cancelFiscalDocument,
} from "@/lib/fiscal.functions";
import {
  ACCOUNTANT_CHECKLIST_ITEMS, FISCAL_CONFIG_STATUS_LABEL, FISCAL_STATUS_LABEL,
  OPERATION_TYPE_OPTIONS, REGIME_TRIBUTARIO_OPTIONS, type FiscalConfigView,
} from "@/lib/fiscal/types";

export const Route = createFileRoute("/_authenticated/app/fiscal")({
  component: FiscalPage,
  head: () => ({
    meta: [
      { title: "Fiscal — NF-e | Lupus CRM" },
      { name: "description", content: "Emissão, consulta e cancelamento de NF-e de veículos por workspace." },
      { property: "og:title", content: "Fiscal — NF-e | Lupus CRM" },
      { property: "og:description", content: "Gestão fiscal multiempresa com homologação e produção controlada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_STYLE: Record<string, string> = {
  authorized: "bg-emerald-100 text-emerald-700",
  processing: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-destructive/10 text-destructive",
  error: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

function FiscalPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const isAdmin = ws?.role === "owner" || ws?.role === "admin" || ws?.role === "support";

  const cfgFn = useServerFn(getFiscalConfig);
  const cfgQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["fiscal-config", ws?.id],
    queryFn: () => cfgFn({ data: { workspaceId: ws!.id } }) as Promise<FiscalConfigView>,
  });
  const cfg = cfgQ.data;

  if (!ws) return <div className="p-6 text-sm text-muted-foreground">Carregando workspace…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> Fiscal</h1>
          <p className="text-xs text-muted-foreground">Notas fiscais eletrônicas (NF-e modelo 55) de {ws.name}.</p>
        </div>
        <div className="flex items-center gap-2">
          {cfg?.environment === "homologation" && (
            <Badge className="bg-amber-100 text-amber-800 border-0">AMBIENTE DE HOMOLOGAÇÃO</Badge>
          )}
          {cfg && <StatusPill cfg={cfg} />}
        </div>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs" className="cursor-pointer">Documentos</TabsTrigger>
          {isAdmin && <TabsTrigger value="config" className="cursor-pointer">Configuração</TabsTrigger>}
        </TabsList>

        <TabsContent value="docs" className="mt-4">
          <DocumentsPanel workspaceId={ws.id} canManage={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="config" className="mt-4">
            <ConfigPanel workspaceId={ws.id} cfg={cfg} refetch={() => cfgQ.refetch()} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function StatusPill({ cfg }: { cfg: FiscalConfigView }) {
  const dot =
    cfg.status === "production_ready" ? "🟢" : cfg.status === "not_configured" ? "🔴" : "🟡";
  return (
    <Badge variant="outline" className="gap-1">
      <span>{dot}</span> {FISCAL_CONFIG_STATUS_LABEL[cfg.status]}
    </Badge>
  );
}

/* ============================== DOCUMENTOS ============================== */

function DocumentsPanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listFiscalDocuments);
  const linksFn = useServerFn(getFiscalDocumentLinks);
  const syncFn = useServerFn(syncFiscalDocument);
  const cancelFn = useServerFn(cancelFiscalDocument);

  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [cancelDoc, setCancelDoc] = useState<any | null>(null);
  const [reason, setReason] = useState("");

  const q = useQuery({
    queryKey: ["fiscal-documents", workspaceId, status, direction, source, search],
    queryFn: () =>
      listFn({
        data: {
          workspaceId,
          ...(status !== "all" ? { status } : {}),
          ...(direction !== "all" ? { direction } : {}),
          ...(source !== "all" ? { source } : {}),
          ...(search ? { search } : {}),
        },
      }) as Promise<any[]>,
  });

  const rows = q.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const syncM = useMutation({
    mutationFn: (id: string) => syncFn({ data: { workspaceId, documentId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-documents"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelM = useMutation({
    mutationFn: () => cancelFn({ data: { workspaceId, documentId: cancelDoc.id, reason } }),
    onSuccess: () => {
      toast.success("NF-e cancelada.");
      setCancelDoc(null); setReason("");
      qc.invalidateQueries({ queryKey: ["fiscal-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openFile(id: string, kind: "xml" | "danfe") {
    const res = (await linksFn({ data: { workspaceId, documentId: id } })) as any;
    const url = kind === "xml" ? res.xmlUrl : res.danfeUrl;
    if (!url) { toast.error("Arquivo ainda não disponível."); return; }
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(["authorized", "processing", "rejected", "cancelled", "error"] as const).map((s) => (
          <Card key={s}><CardContent className="p-3">
            <p className="text-[11px] uppercase text-muted-foreground">{FISCAL_STATUS_LABEL[s]}</p>
            <p className="text-xl font-semibold">{counts[s] ?? 0}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar número, chave, CPF/CNPJ ou cliente"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(FISCAL_STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Entradas e saídas</SelectItem>
            <SelectItem value="entry">Somente entradas</SelectItem>
            <SelectItem value="exit">Somente saídas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Emitidas e recebidas</SelectItem>
            <SelectItem value="issued">Emitidas pelo CRM</SelectItem>
            <SelectItem value="imported">Recebidas de fornecedor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {!q.isLoading && rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma NF-e emitida ainda.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium w-20">#{r.number ?? "—"}</span>
              <Badge variant="secondary" className="text-[10px]">
                {r.direction === "entry" ? "Entrada" : "Saída"}
                {r.source === "imported" ? " • fornecedor" : ""}
              </Badge>
              <span className="flex-1 min-w-40 truncate">
                {(r.direction === "entry" ? r.supplier_snapshot?.name : r.recipient_snapshot?.name) ??
                  r.recipient_snapshot?.name ??
                  "—"}
              </span>
              <span className="flex-1 min-w-40 truncate text-muted-foreground">{r.vehicle_label ?? "—"}</span>
              <span className="w-28 text-right">
                {r.total_amount != null
                  ? Number(r.total_amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "—"}
              </span>
              <Badge className={`border-0 ${STATUS_STYLE[r.status] ?? ""}`}>{FISCAL_STATUS_LABEL[r.status as keyof typeof FISCAL_STATUS_LABEL] ?? r.status}</Badge>
              <span className="text-xs text-muted-foreground w-24">
                {new Date(r.created_at).toLocaleDateString("pt-BR")}
              </span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => syncM.mutate(r.id)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {r.danfe_storage_path && (
                  <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => openFile(r.id, "danfe")}>
                    <Download className="h-3.5 w-3.5 mr-1" /> DANFE
                  </Button>
                )}
                {r.xml_storage_path && (
                  <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => openFile(r.id, "xml")}>
                    XML
                  </Button>
                )}
                {canManage && r.status === "authorized" && (
                  <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => setCancelDoc(r)}>
                    Cancelar
                  </Button>
                )}
              </div>
              {(r.status === "rejected" || r.status === "error") && r.rejection_message && (
                <p className="w-full text-xs text-destructive">{r.rejection_message}</p>
              )}
              {r.status === "cancelled" && r.cancel_reason && (
                <p className="w-full text-xs text-muted-foreground">Motivo: {r.cancel_reason}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!cancelDoc} onOpenChange={(o) => !o && setCancelDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancelar NF-e #{cancelDoc?.number}</DialogTitle></DialogHeader>
          <Label className="text-xs text-muted-foreground">Motivo (mínimo 15 caracteres)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <Button className="cursor-pointer" disabled={reason.trim().length < 15 || cancelM.isPending}
            onClick={() => cancelM.mutate()}>
            {cancelM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Confirmar cancelamento
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================== CONFIGURAÇÃO ============================== */

function ConfigPanel({ workspaceId, cfg, refetch }: { workspaceId: string; cfg?: FiscalConfigView; refetch: () => void }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveFiscalConfig);
  const certFn = useServerFn(uploadFiscalCertificate);
  const certCheckFn = useServerFn(checkFiscalCertificate);
  const confirmCertFn = useServerFn(confirmExternalCertificate);
  const prodFn = useServerFn(enableFiscalProduction);
  const profilesFn = useServerFn(listFiscalProfiles);
  const upsertProfileFn = useServerFn(upsertFiscalProfile);
  const deleteProfileFn = useServerFn(deleteFiscalProfile);

  const [emitter, setEmitter] = useState<Record<string, any>>({});
  const [tokenHomolog, setTokenHomolog] = useState("");
  const [tokenProd, setTokenProd] = useState("");
  const [certPassword, setCertPassword] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [showCertUpload, setShowCertUpload] = useState(false);

  const e = { ...(cfg?.emitter ?? {}), ...emitter } as Record<string, any>;
  const checklist = cfg?.accountant_checklist ?? {};

  const profilesQ = useQuery({
    queryKey: ["fiscal-profiles", workspaceId],
    queryFn: () => profilesFn({ data: { workspaceId } }) as Promise<any[]>,
  });

  const saveM = useMutation({
    mutationFn: (extra?: Record<string, any>) =>
      saveFn({
        data: {
          workspaceId,
          emitter: {
            // remove nulos/vazios vindos da config atual — o backend só aceita strings
            ...Object.fromEntries(
              Object.entries(e).filter(([, v]) => v !== null && v !== undefined && v !== ""),
            ),
            ...(e.regime_tributario ? { regime_tributario: Number(e.regime_tributario) } : {}),
            ...(e.serie_padrao ? { serie_padrao: Number(e.serie_padrao) } : {}),
          },
          ...(tokenHomolog ? { tokenHomolog } : {}),
          ...(tokenProd ? { tokenProd } : {}),
          ...(extra ?? {}),
        } as any,
      }),
    onSuccess: () => { toast.success("Configuração fiscal salva."); setTokenHomolog(""); setTokenProd(""); refetch(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const certM = useMutation({
    mutationFn: async () => {
      if (!certFile) throw new Error("Selecione o arquivo .pfx/.p12.");
      const b64 = await fileToBase64(certFile);
      return certFn({ data: { workspaceId, filename: certFile.name, fileBase64: b64, password: certPassword } });
    },
    onSuccess: () => { toast.success("Certificado enviado ao provedor fiscal."); setCertFile(null); setCertPassword(""); setShowCertUpload(false); certCheckQ.refetch(); refetch(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const certCheckQ = useQuery({
    queryKey: ["fiscal-cert-check", workspaceId],
    queryFn: () =>
      certCheckFn({ data: { workspaceId } }) as Promise<{
        found: boolean;
        source: "provider" | "local" | "external_declared" | "none";
        status: string;
        expiresAt: string | null;
        expired?: boolean;
        verifiable: boolean;
        message?: string;
      }>,
    staleTime: 60_000,
  });

  const confirmCertM = useMutation({
    mutationFn: (confirmed: boolean) => confirmCertFn({ data: { workspaceId, confirmed } }),
    onSuccess: () => {
      toast.success("Certificado informado como cadastrado na Focus NFe.");
      certCheckQ.refetch();
      refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const prodM = useMutation({
    mutationFn: () => prodFn({ data: { workspaceId, confirm: true } }),
    onSuccess: () => { toast.success("Produção habilitada."); refetch(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const chk = certCheckQ.data;
  const certStatusValue = chk?.status ?? cfg?.certificate_status ?? "missing";
  const certDeclared = certStatusValue === "external_declared";
  const steps = [
    { key: "empresa", label: "Empresa", done: !!(cfg?.emitter.cnpj_emitente && cfg?.emitter.emit_razao_social && cfg?.emitter.emit_ibge) },
    { key: "provider", label: "Provedor", done: !!(cfg?.has_token_homolog || cfg?.has_token_prod) },
    { key: "cert", label: "Certificado", done: certCheckQ.data?.found || certDeclared || cfg?.certificate_status === "configured" },
    { key: "nfe", label: "Configuração NF-e", done: !!(cfg?.emitter.serie_padrao && cfg?.emitter.regime_tributario) },
    { key: "profile", label: "Perfil fiscal", done: (profilesQ.data ?? []).some((p) => p.active) },
    { key: "homolog", label: "Teste em homologação", done: false },
    { key: "prod", label: "Produção", done: !!cfg?.production_enabled },
  ];
  const done = steps.filter((s) => s.done).length;

  const certStatus = chk?.source === "provider"
    ? chk.expired
      ? { ok: false, label: "Certificado vencido na Focus NFe", expiresAt: chk.expiresAt }
      : { ok: true, label: "Certificado configurado na Focus NFe", expiresAt: chk.expiresAt }
    : certStatusValue === "configured"
      ? { ok: true, label: "Certificado configurado", expiresAt: chk?.expiresAt ?? cfg?.certificate_expires_at ?? null }
      : certDeclared
        ? { ok: true, label: "Certificado informado como cadastrado na Focus NFe", expiresAt: chk?.expiresAt ?? null }
        : { ok: false, label: "Não configurado", expiresAt: null as string | null };


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Onboarding fiscal — {done}/7 concluído</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <Badge key={s.key} variant={s.done ? "default" : "outline"} className="gap-1">
              {s.done ? <CheckCircle2 className="h-3 w-3" /> : <span className="text-[10px]">{i + 1}</span>} {s.label}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {cfg && cfg.missing.length > 0 && (
        <Card className="border-amber-300">
          <CardContent className="p-3 text-sm">
            <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-600" /> Pendências</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {cfg.missing.map((m, i) => <li key={i}>{m.message}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do emitente</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <F label="Razão social" v={e.emit_razao_social} on={(v) => setEmitter({ ...emitter, emit_razao_social: v })} />
          <F label="Nome fantasia" v={e.emit_nome_fantasia} on={(v) => setEmitter({ ...emitter, emit_nome_fantasia: v })} />
          <F label="CNPJ" v={e.cnpj_emitente} on={(v) => setEmitter({ ...emitter, cnpj_emitente: v })} />
          <F label="Inscrição Estadual" v={e.ie_emitente} on={(v) => setEmitter({ ...emitter, ie_emitente: v })} />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Regime tributário</Label>
            <Select value={e.regime_tributario ? String(e.regime_tributario) : ""}
              onValueChange={(v) => setEmitter({ ...emitter, regime_tributario: Number(v) })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {REGIME_TRIBUTARIO_OPTIONS.filter((o) => o.value <= 3).map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <F label="Série NF-e" v={e.serie_padrao} on={(v) => setEmitter({ ...emitter, serie_padrao: v })} />
          <F label="Telefone" v={e.emit_telefone} on={(v) => setEmitter({ ...emitter, emit_telefone: v })} />
          <F label="E-mail" v={e.emit_email} on={(v) => setEmitter({ ...emitter, emit_email: v })} />
          <F label="CEP" v={e.emit_cep} on={(v) => setEmitter({ ...emitter, emit_cep: v })} />
          <F label="Logradouro" v={e.emit_logradouro} on={(v) => setEmitter({ ...emitter, emit_logradouro: v })} />
          <F label="Número" v={e.emit_numero} on={(v) => setEmitter({ ...emitter, emit_numero: v })} />
          <F label="Complemento" v={e.emit_complemento} on={(v) => setEmitter({ ...emitter, emit_complemento: v })} />
          <F label="Bairro" v={e.emit_bairro} on={(v) => setEmitter({ ...emitter, emit_bairro: v })} />
          <F label="Município" v={e.emit_municipio} on={(v) => setEmitter({ ...emitter, emit_municipio: v })} />
          <F label="Código IBGE" v={e.emit_ibge} on={(v) => setEmitter({ ...emitter, emit_ibge: v })} />
          <F label="UF" v={e.emit_uf} on={(v) => setEmitter({ ...emitter, emit_uf: v.toUpperCase().slice(0, 2) })} />
          <div className="sm:col-span-3">
            <Button className="cursor-pointer" disabled={saveM.isPending} onClick={() => saveM.mutate(undefined)}>
              {saveM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Salvar dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Provedor fiscal (Focus NFe)</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Token de homologação {cfg?.has_token_homolog && <span className="text-emerald-600">• configurado</span>}
            </Label>
            <Input type="password" value={tokenHomolog} placeholder="••••••" onChange={(ev) => setTokenHomolog(ev.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Token de produção {cfg?.has_token_prod && <span className="text-emerald-600">• configurado</span>}
            </Label>
            <Input type="password" value={tokenProd} placeholder="••••••" onChange={(ev) => setTokenProd(ev.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button variant="outline" className="cursor-pointer" disabled={saveM.isPending} onClick={() => saveM.mutate(undefined)}>
              Salvar credenciais
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Certificado digital A1</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {certCheckQ.isLoading ? (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando certificado no provedor fiscal...
            </p>
          ) : certStatus.ok ? (
            <p className="flex items-center gap-2">
              <ShieldCheck className={`h-4 w-4 ${certDeclared ? "text-amber-500" : "text-emerald-600"}`} /> {certStatus.label}
              {certStatus.expiresAt && (
                <span className="text-muted-foreground text-xs">
                  • validade {new Date(certStatus.expiresAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-4 w-4" /> {certStatus.label}
            </p>
          )}
          {certDeclared && (
            <p className="text-xs text-muted-foreground">
              A confirmação definitiva ocorrerá na primeira comunicação bem-sucedida com o provedor.
            </p>
          )}
          {certCheckQ.data?.message && (
            <p className="text-xs text-amber-700">{certCheckQ.data.message}</p>
          )}
          {!certCheckQ.isLoading && chk && !chk.verifiable && !certStatus.ok && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-2">
              <p className="text-xs text-amber-800 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                Não foi possível verificar automaticamente o certificado na Focus NFe. A API
                administrativa de empresas da Focus não utiliza o ambiente de homologação.
              </p>
              <Button size="sm" variant="outline" className="cursor-pointer h-8 text-xs"
                disabled={confirmCertM.isPending}
                onClick={() => confirmCertM.mutate(true)}>
                {confirmCertM.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Confirmar certificado já cadastrado na Focus
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" className="cursor-pointer h-8 text-xs"
              disabled={certCheckQ.isFetching}
              onClick={() => { certCheckQ.refetch(); refetch(); }}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${certCheckQ.isFetching ? "animate-spin" : ""}`} />
              Verificar no provedor
            </Button>
            {certDeclared && (
              <Button variant="ghost" size="sm" className="cursor-pointer h-8 text-xs text-destructive"
                disabled={confirmCertM.isPending}
                onClick={() => confirmCertM.mutate(false)}>
                Remover confirmação
              </Button>
            )}
            <Button variant="outline" size="sm" className="cursor-pointer h-8 text-xs"
              onClick={() => setShowCertUpload((v) => !v)}>
              {certStatus.ok ? "Substituir certificado" : "Enviar certificado"}
            </Button>
          </div>


          {showCertUpload && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                O arquivo e a senha são enviados diretamente ao provedor fiscal e nunca ficam armazenados no CRM.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Arquivo .pfx/.p12</Label>
                  <Input type="file" accept=".pfx,.p12" className="cursor-pointer"
                    onChange={(ev) => setCertFile(ev.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Senha do certificado</Label>
                  <Input type="password" value={certPassword} onChange={(ev) => setCertPassword(ev.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button className="cursor-pointer" disabled={!certFile || !certPassword || certM.isPending}
                    onClick={() => certM.mutate()}>
                    {certM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Enviar ao provedor
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ProfilesCard
        workspaceId={workspaceId}
        profiles={profilesQ.data ?? []}
        onSaved={() => { profilesQ.refetch(); qc.invalidateQueries({ queryKey: ["fiscal-config"] }); refetch(); }}
        upsert={upsertProfileFn}
        remove={deleteProfileFn}
      />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Checklist do contador</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            Solicite ao contador da empresa as informações fiscais necessárias para emissão. O CRM não sugere valores tributários.
          </p>
          {ACCOUNTANT_CHECKLIST_ITEMS.map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm">{item.label}</span>
              <Switch
                checked={!!checklist[item.key]}
                onCheckedChange={(v) =>
                  saveM.mutate({ accountantChecklist: { ...checklist, [item.key]: v } })
                }
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Ambiente de emissão</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Ambiente atual: <Badge variant="outline">{cfg?.environment === "production" ? "Produção" : "Homologação"}</Badge></p>
          {!cfg?.production_enabled ? (
            <>
              <p className="text-xs text-muted-foreground">
                ATENÇÃO: habilitar produção permite emissão fiscal real. É necessário ter uma NF-e autorizada em homologação.
              </p>
              <Button variant="destructive" className="cursor-pointer" disabled={prodM.isPending}
                onClick={() => {
                  if (window.confirm("ATENÇÃO: você está habilitando emissão fiscal em produção. Confirmar?")) prodM.mutate();
                }}>
                {prodM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Habilitar produção
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="cursor-pointer"
                onClick={() => saveM.mutate({ environment: "homologation" })}>Usar homologação</Button>
              <Button variant="destructive" className="cursor-pointer"
                onClick={() => saveM.mutate({ environment: "production" })}>Usar produção</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfilesCard({
  workspaceId, profiles, onSaved, upsert, remove,
}: {
  workspaceId: string;
  profiles: any[];
  onSaved: () => void;
  upsert: ReturnType<typeof useServerFn<typeof upsertFiscalProfile>>;
  remove: ReturnType<typeof useServerFn<typeof deleteFiscalProfile>>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ operation_type: "venda_veiculo_usado_interna", product_origin: "0" });
  const [tax, setTax] = useState<Record<string, string>>({});

  const saveM = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          workspaceId,
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          operation_type: form.operation_type,
          operation_key: form.operation_key || null,

          cfop: form.cfop,
          ncm: form.ncm,
          cest: form.cest,
          product_origin: form.product_origin,
          natureza_operacao: form.natureza_operacao,
          additional_information: form.additional_information,
          is_default: !!form.is_default,
          tax_configuration: Object.fromEntries(Object.entries(tax).filter(([, v]) => v !== "")),
        } as any,
      }),
    onSuccess: () => { toast.success("Perfil fiscal salvo."); setOpen(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(p: any) {
    setForm(p);
    setTax((p.tax_configuration ?? {}) as Record<string, string>);
    setOpen(true);
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">Perfis fiscais</CardTitle>
        <Button size="sm" variant="outline" className="cursor-pointer"
          onClick={() => { setForm({ operation_type: "venda_veiculo_usado_interna", product_origin: "0" }); setTax({}); setOpen(true); }}>
          Novo perfil
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          Os valores tributários devem ser informados pela contabilidade do workspace. O CRM não calcula nem sugere tributos.
        </p>
        {profiles.filter((p) => p.active).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 border border-border rounded-lg p-2">
            <div>
              <p className="font-medium">{p.name} {p.is_default && <Badge variant="secondary" className="ml-1 text-[10px]">Padrão</Badge>}</p>
              <p className="text-xs text-muted-foreground">
                CFOP {p.cfop ?? "—"} • NCM {p.ncm ?? "—"}
                {p.operation_key ? ` • ${operationLabel(p.operation_key)}` : " • operação fiscal não vinculada"}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => edit(p)}>Editar</Button>
              <Button size="sm" variant="ghost" className="cursor-pointer text-destructive"
                onClick={async () => { await remove({ data: { workspaceId, id: p.id } }); onSaved(); }}>
                Remover
              </Button>
            </div>
          </div>
        ))}
        {profiles.filter((p) => p.active).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum perfil cadastrado.</p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Perfil fiscal</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Nome" v={form.name} on={(v) => setForm({ ...form, name: v })} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo de operação</Label>
              <Select value={form.operation_type} onValueChange={(v) => setForm({ ...form, operation_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATION_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <F label="CFOP" v={form.cfop} on={(v) => setForm({ ...form, cfop: v })} />
            <F label="NCM" v={form.ncm} on={(v) => setForm({ ...form, ncm: v })} />
            <F label="CEST (opcional)" v={form.cest} on={(v) => setForm({ ...form, cest: v })} />
            <F label="Origem do produto" v={form.product_origin} on={(v) => setForm({ ...form, product_origin: v })} />
            <F label="Natureza da operação" v={form.natureza_operacao} on={(v) => setForm({ ...form, natureza_operacao: v })} />
            <F label="CST/CSOSN ICMS" v={tax.icms_situacao_tributaria} on={(v) => setTax({ ...tax, icms_situacao_tributaria: v })} />
            <F label="CST PIS" v={tax.pis_situacao_tributaria} on={(v) => setTax({ ...tax, pis_situacao_tributaria: v })} />
            <F label="CST COFINS" v={tax.cofins_situacao_tributaria} on={(v) => setTax({ ...tax, cofins_situacao_tributaria: v })} />
            <F label="Alíquota ICMS (%)" v={tax.icms_aliquota} on={(v) => setTax({ ...tax, icms_aliquota: v })} />
            <F label="Redução base ICMS (%)" v={tax.icms_reducao_base_calculo} on={(v) => setTax({ ...tax, icms_reducao_base_calculo: v })} />
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Informações adicionais</Label>
              <Textarea rows={2} value={form.additional_information ?? ""}
                onChange={(ev) => setForm({ ...form, additional_information: ev.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Switch checked={!!form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
              Usar como perfil padrão
            </label>
          </div>
          <Button className="cursor-pointer" disabled={!form.name || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Salvar perfil
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function F({ label, v, on }: { label: string; v: any; on: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={v ?? ""} onChange={(e) => on(e.target.value)} />
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
