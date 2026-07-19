import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Car, Plus, Package, ArrowDownToLine, ArrowUpFromLine, FileText,
  Settings2, PlugZap, History, RefreshCw, ShieldCheck, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/renave")({
  component: RenavePage,
});

function RenavePage() {
  const { data: workspaces } = useMyWorkspaces();
  const workspaceId = workspaces?.[0]?.id;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-brand grid place-items-center shadow-glow">
            <Car className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">RENAVE</h1>
            <p className="text-sm text-muted-foreground">
              Gestão de estoque, entrada/saída e integração SERPRO
            </p>
          </div>
        </div>
      </header>

      {!workspaceId ? (
        <div className="text-sm text-muted-foreground">Carregando workspace…</div>
      ) : (
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="dashboard"><Package className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="vehicles"><Car className="h-4 w-4 mr-1" />Estoque</TabsTrigger>
            <TabsTrigger value="operations"><History className="h-4 w-4 mr-1" />Operações</TabsTrigger>
            <TabsTrigger value="endpoints"><PlugZap className="h-4 w-4 mr-1" />Endpoints</TabsTrigger>
            <TabsTrigger value="settings"><Settings2 className="h-4 w-4 mr-1" />Config</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="vehicles"><VehiclesTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="operations"><OperationsTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="endpoints"><EndpointsTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="settings"><SettingsTab workspaceId={workspaceId} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ----------------------- DASHBOARD ----------------------- */
function DashboardTab({ workspaceId }: { workspaceId: string }) {
  const { data: stats } = useQuery({
    queryKey: ["renave-stats", workspaceId],
    queryFn: async () => {
      const [{ count: total }, { count: emEstoque }, { count: pendentes }, { count: ops }] = await Promise.all([
        supabase.from("renave_vehicles").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
        supabase.from("renave_vehicles").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "em_estoque"),
        supabase.from("renave_vehicles").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).in("status", ["entrada_pendente", "saida_pendente"]),
        supabase.from("renave_operations").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      ]);
      return { total: total ?? 0, emEstoque: emEstoque ?? 0, pendentes: pendentes ?? 0, ops: ops ?? 0 };
    },
  });

  const cards = [
    { label: "Total de veículos", value: stats?.total ?? 0, icon: Car },
    { label: "Em estoque", value: stats?.emEstoque ?? 0, icon: Package },
    { label: "Pendentes SERPRO", value: stats?.pendentes ?? 0, icon: AlertTriangle },
    { label: "Operações registradas", value: stats?.ops ?? 0, icon: History },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-2xl font-semibold mt-1">{c.value}</div>
            </div>
            <c.icon className="h-5 w-5 text-primary" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ----------------------- VEÍCULOS ----------------------- */
function VehiclesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["renave-vehicles", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renave_vehicles").select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("renave_vehicles").insert({ ...payload, workspace_id: workspaceId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo cadastrado");
      qc.invalidateQueries({ queryKey: ["renave-vehicles", workspaceId] });
      qc.invalidateQueries({ queryKey: ["renave-stats", workspaceId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <div className="text-sm text-muted-foreground">{data?.length ?? 0} veículos</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gradient-brand text-primary-foreground border-0">
              <Plus className="h-4 w-4 mr-1" />Novo veículo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Cadastrar veículo</DialogTitle></DialogHeader>
            <VehicleForm onSubmit={(v) => create.mutate(v)} pending={create.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Placa</th>
                <th className="text-left p-3">Chassi</th>
                <th className="text-left p-3">Marca / Modelo</th>
                <th className="text-left p-3">Ano</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="p-3 font-mono">{v.placa ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{v.chassi ?? "—"}</td>
                  <td className="p-3">{[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-3">{v.ano_modelo ?? v.ano_fabricacao ?? "—"}</td>
                  <td className="p-3"><StatusBadge status={v.status} /></td>
                  <td className="p-3 flex gap-2">
                    <QuickOpButton workspaceId={workspaceId} vehicleId={v.id} type="entrada" label="Entrada" icon={ArrowDownToLine} />
                    <QuickOpButton workspaceId={workspaceId} vehicleId={v.id} type="saida" label="Saída" icon={ArrowUpFromLine} />
                  </td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">Nenhum veículo cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    novo: { label: "Novo", cls: "bg-muted text-foreground" },
    entrada_pendente: { label: "Entrada pendente", cls: "bg-amber-500/20 text-amber-300" },
    em_estoque: { label: "Em estoque", cls: "bg-emerald-500/20 text-emerald-300" },
    saida_pendente: { label: "Saída pendente", cls: "bg-amber-500/20 text-amber-300" },
    vendido: { label: "Vendido", cls: "bg-blue-500/20 text-blue-300" },
    cancelado: { label: "Cancelado", cls: "bg-red-500/20 text-red-300" },
  };
  const s = map[status ?? "novo"] ?? map.novo;
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${s.cls}`}>{s.label}</span>;
}

function VehicleForm({ onSubmit, pending }: { onSubmit: (v: Record<string, unknown>) => void; pending: boolean }) {
  const [form, setForm] = useState({
    placa: "", chassi: "", renavam: "", marca: "", modelo: "",
    ano_modelo: "", cor: "", valor_compra: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          placa: form.placa.toUpperCase() || null,
          chassi: form.chassi.toUpperCase() || null,
          renavam: form.renavam || null,
          marca: form.marca || null,
          modelo: form.modelo || null,
          ano_modelo: form.ano_modelo ? Number(form.ano_modelo) : null,
          cor: form.cor || null,
          valor_compra: form.valor_compra ? Number(form.valor_compra) : null,
          status: "novo",
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Placa</Label><Input value={form.placa} onChange={set("placa")} placeholder="ABC1D23" /></div>
        <div><Label>RENAVAM</Label><Input value={form.renavam} onChange={set("renavam")} /></div>
        <div className="col-span-2"><Label>Chassi</Label><Input value={form.chassi} onChange={set("chassi")} /></div>
        <div><Label>Marca</Label><Input value={form.marca} onChange={set("marca")} /></div>
        <div><Label>Modelo</Label><Input value={form.modelo} onChange={set("modelo")} /></div>
        <div><Label>Ano modelo</Label><Input value={form.ano_modelo} onChange={set("ano_modelo")} type="number" /></div>
        <div><Label>Cor</Label><Input value={form.cor} onChange={set("cor")} /></div>
        <div className="col-span-2"><Label>Valor de compra (R$)</Label><Input value={form.valor_compra} onChange={set("valor_compra")} type="number" step="0.01" /></div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending} className="gradient-brand text-primary-foreground border-0">
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function QuickOpButton({ workspaceId, vehicleId, type, label, icon: Icon }: {
  workspaceId: string; vehicleId: string;
  type: "entrada" | "saida"; label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("renave_operations").insert({
        workspace_id: workspaceId,
        vehicle_id: vehicleId,
        operation_type: type,
        status: "pendente",
      });
      if (error) throw error;
      await supabase.from("renave_vehicles").update({
        status: type === "entrada" ? "entrada_pendente" : "saida_pendente",
      }).eq("id", vehicleId);
    },
    onSuccess: () => {
      toast.success(`${label} registrada (pendente SERPRO)`);
      qc.invalidateQueries({ queryKey: ["renave-vehicles", workspaceId] });
      qc.invalidateQueries({ queryKey: ["renave-operations", workspaceId] });
      qc.invalidateQueries({ queryKey: ["renave-stats", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      <Icon className="h-3.5 w-3.5 mr-1" />{label}
    </Button>
  );
}

/* ----------------------- OPERAÇÕES ----------------------- */
function OperationsTab({ workspaceId }: { workspaceId: string }) {
  const { data } = useQuery({
    queryKey: ["renave-operations", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renave_operations").select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Endpoint</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Erro</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3">{o.operation_type}</td>
                <td className="p-3 font-mono text-xs">{o.endpoint_code ?? "—"}</td>
                <td className="p-3"><OpStatus status={o.status} /></td>
                <td className="p-3 text-xs text-red-400 truncate max-w-xs">{o.error_message ?? "—"}</td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">Nenhuma operação registrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function OpStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "bg-amber-500/20 text-amber-300",
    em_andamento: "bg-blue-500/20 text-blue-300",
    sucesso: "bg-emerald-500/20 text-emerald-300",
    falha: "bg-red-500/20 text-red-300",
    cancelada: "bg-muted text-foreground",
  };
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs ${map[status] ?? map.pendente}`}>{status}</span>;
}

/* ----------------------- ENDPOINTS ----------------------- */
function EndpointsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["renave-endpoints", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renave_endpoints").select("*")
        .eq("workspace_id", workspaceId)
        .order("category").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("renave_seed_endpoints", { _workspace_id: workspaceId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endpoints do Swagger carregados");
      qc.invalidateQueries({ queryKey: ["renave-endpoints", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const g: Record<string, typeof data> = {};
    (data ?? []).forEach((e) => { (g[e.category] ??= [] as never).push(e as never); });
    return g;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cada operação da API do SERPRO é cadastrada aqui. Você pode alterar método, path e template do corpo por cliente.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
            <RefreshCw className="h-4 w-4 mr-1" />Carregar endpoints do Swagger
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-brand text-primary-foreground border-0">
                <Plus className="h-4 w-4 mr-1" />Novo endpoint
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Novo endpoint</DialogTitle></DialogHeader>
              <EndpointForm workspaceId={workspaceId} onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{cat}</h3>
          <div className="grid gap-2">
            {(items ?? []).map((e) => (
              <Card key={e.id} className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{e.method}</Badge>
                    <span className="font-medium truncate">{e.name}</span>
                    {e.is_system && <Badge variant="secondary" className="text-[10px]">sistema</Badge>}
                    {!e.is_enabled && <Badge className="bg-red-500/20 text-red-300 text-[10px]">desativado</Badge>}
                  </div>
                  <code className="text-xs text-muted-foreground truncate block">{e.path_template}</code>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {(!data || data.length === 0) && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum endpoint. Clique em "Carregar endpoints do Swagger" para importar os 8 endpoints oficiais.
        </Card>
      )}
    </div>
  );
}

function EndpointForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: "", name: "", category: "outros", method: "GET",
    path_template: "", description: "",
  });
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("renave_endpoints").insert({
        workspace_id: workspaceId, ...f, is_system: false, is_enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Endpoint criado");
      qc.invalidateQueries({ queryKey: ["renave-endpoints", workspaceId] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Código</Label><Input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
        <div>
          <Label>Categoria</Label>
          <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["atpv", "crlve", "estoque", "cliente", "pdf_atpv", "nfe", "outros"].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2"><Label>Nome</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div>
          <Label>Método</Label>
          <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Path template</Label><Input required value={f.path_template} onChange={(e) => setF({ ...f, path_template: e.target.value })} placeholder="/api/..." /></div>
        <div className="col-span-2"><Label>Descrição</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={m.isPending} className="gradient-brand text-primary-foreground border-0">
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ----------------------- CONFIG ----------------------- */
function SettingsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ["renave-config", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renave_config").select("*").eq("workspace_id", workspaceId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const merged = { ...(cfg ?? {}), ...form } as Record<string, string | boolean | null>;
  const set = (k: string, v: string | boolean) => setForm((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        workspace_id: workspaceId,
        environment: (merged.environment as string) ?? "homologacao",
        base_url: (merged.base_url as string) ?? "https://renave.estaleiro.serpro.gov.br/renave-ws",
        cnpj: (merged.cnpj as string) || null,
        consumer_key: (merged.consumer_key as string) || null,
        consumer_secret_ref: (merged.consumer_secret_ref as string) || null,
        certificate_ref: (merged.certificate_ref as string) || null,
        certificate_password_ref: (merged.certificate_password_ref as string) || null,
        oauth_token_url: (merged.oauth_token_url as string) || null,
        is_active: !!merged.is_active,
      };
      const { error } = await supabase.from("renave_config").upsert(payload, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["renave-config", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4 space-y-3 md:col-span-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Ambiente SERPRO</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Ambiente</Label>
            <Select
              value={(merged.environment as string) ?? "homologacao"}
              onValueChange={(v) => set("environment", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">Homologação</SelectItem>
                <SelectItem value="producao">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>URL base</Label>
            <Input value={(merged.base_url as string) ?? ""} onChange={(e) => set("base_url", e.target.value)} />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input value={(merged.cnpj as string) ?? ""} onChange={(e) => set("cnpj", e.target.value)} />
          </div>
          <div>
            <Label>OAuth Token URL</Label>
            <Input value={(merged.oauth_token_url as string) ?? ""} onChange={(e) => set("oauth_token_url", e.target.value)} placeholder="https://.../oauth/token" />
          </div>
          <div>
            <Label>Consumer Key</Label>
            <Input value={(merged.consumer_key as string) ?? ""} onChange={(e) => set("consumer_key", e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3 md:col-span-2">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Segredos (armazenados via Lovable Secrets)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Guarde os valores sensíveis (Consumer Secret, certificado .p12 em base64 e a senha) como secrets do
          backend. Aqui você só informa o <b>nome</b> do secret que o servidor deve ler.
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Nome do secret — Consumer Secret</Label>
            <Input value={(merged.consumer_secret_ref as string) ?? ""} onChange={(e) => set("consumer_secret_ref", e.target.value)} placeholder="RENAVE_CONSUMER_SECRET" />
          </div>
          <div>
            <Label>Nome do secret — Certificado (.p12 base64)</Label>
            <Input value={(merged.certificate_ref as string) ?? ""} onChange={(e) => set("certificate_ref", e.target.value)} placeholder="RENAVE_CERT_P12_B64" />
          </div>
          <div>
            <Label>Nome do secret — Senha do certificado</Label>
            <Input value={(merged.certificate_password_ref as string) ?? ""} onChange={(e) => set("certificate_password_ref", e.target.value)} placeholder="RENAVE_CERT_PASSWORD" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!merged.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
            Integração ativa
          </label>
        </div>
      </Card>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-brand text-primary-foreground border-0">
          <FileText className="h-4 w-4 mr-1" />{save.isPending ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
