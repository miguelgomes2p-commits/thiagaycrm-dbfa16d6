import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { setRenaveCredentials, testRenaveConnection, retryRenaveOperation } from "@/lib/renave.functions";
import { setNfeConfig, testNfeConnection, emitNfe, pollNfeStatus } from "@/lib/nfe.functions";
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
  Settings2, PlugZap, History, RefreshCw, ShieldCheck, AlertTriangle, Upload,
  Receipt,
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
          <TabsList className="grid w-full grid-cols-6 max-w-4xl">
            <TabsTrigger value="dashboard"><Package className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="vehicles"><Car className="h-4 w-4 mr-1" />Estoque</TabsTrigger>
            <TabsTrigger value="nfe"><Receipt className="h-4 w-4 mr-1" />NF-e</TabsTrigger>
            <TabsTrigger value="operations"><History className="h-4 w-4 mr-1" />Operações</TabsTrigger>
            <TabsTrigger value="endpoints"><PlugZap className="h-4 w-4 mr-1" />Endpoints</TabsTrigger>
            <TabsTrigger value="settings"><Settings2 className="h-4 w-4 mr-1" />Config</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="vehicles"><VehiclesTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="nfe"><NfeTab workspaceId={workspaceId} /></TabsContent>
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
  const qc = useQueryClient();
  const retryFn = useServerFn(retryRenaveOperation);
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

  const retry = useMutation({
    mutationFn: async (id: string) => retryFn({ data: { operationId: id } }),
    onSuccess: () => {
      toast.success("Reenfileirada");
      qc.invalidateQueries({ queryKey: ["renave-operations", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
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
              <th className="text-left p-3">Ações</th>
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
                <td className="p-3">
                  {o.status === "falha" && o.endpoint_code && (
                    <Button size="sm" variant="outline" disabled={retry.isPending}
                      onClick={() => retry.mutate(o.id)}>
                      <RefreshCw className="h-3 w-3 mr-1" />Reprocessar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">Nenhuma operação registrada</td></tr>
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

      <Card className="p-4 space-y-4 md:col-span-2">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Certificado & Credenciais OAuth (cifradas no servidor)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          O certificado <b>.p12</b> é enviado para um bucket privado; senha e client_secret são cifrados
          (AES-256-GCM) no banco. Nada disso volta para o navegador.
        </p>

        <CertUploadRow workspaceId={workspaceId} currentPath={(merged.cert_storage_path as string) ?? null} />
        <CredentialsRow workspaceId={workspaceId} />

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

      <div className="md:col-span-2 flex justify-end gap-2">
        <TestConnectionButton workspaceId={workspaceId} />
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-brand text-primary-foreground border-0">
          <FileText className="h-4 w-4 mr-1" />{save.isPending ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------- CERT UPLOAD ----------------------- */
function CertUploadRow({ workspaceId, currentPath }: { workspaceId: string; currentPath: string | null }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const path = `${workspaceId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("renave-certs")
        .upload(path, file, { contentType: "application/x-pkcs12", upsert: false });
      if (upErr) throw upErr;
      const { error: cfgErr } = await supabase.from("renave_config")
        .update({ cert_storage_path: path })
        .eq("workspace_id", workspaceId);
      if (cfgErr) throw cfgErr;
      toast.success("Certificado enviado");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["renave-config", workspaceId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-3 items-end">
      <div>
        <Label>Certificado .p12</Label>
        <Input type="file" accept=".p12,.pfx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {currentPath && (
          <p className="text-xs text-muted-foreground mt-1 truncate">Atual: {currentPath}</p>
        )}
      </div>
      <div>
        <Button type="button" onClick={handleUpload} disabled={!file || uploading} variant="outline">
          <Upload className="h-4 w-4 mr-1" />{uploading ? "Enviando…" : "Enviar certificado"}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------- CREDENCIAIS ----------------------- */
function CredentialsRow({ workspaceId }: { workspaceId: string }) {
  const setCreds = useServerFn(setRenaveCredentials);
  const [certPassword, setCertPassword] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");

  const m = useMutation({
    mutationFn: async () =>
      setCreds({
        data: {
          workspaceId,
          certPassword: certPassword || undefined,
          oauthClientId: oauthClientId || undefined,
          oauthClientSecret: oauthClientSecret || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Credenciais atualizadas");
      setCertPassword(""); setOauthClientSecret("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid md:grid-cols-3 gap-3 items-end">
      <div>
        <Label>Senha do .p12</Label>
        <Input type="password" value={certPassword}
          onChange={(e) => setCertPassword(e.target.value)} placeholder="••••••" />
      </div>
      <div>
        <Label>OAuth Client ID</Label>
        <Input value={oauthClientId} onChange={(e) => setOauthClientId(e.target.value)} />
      </div>
      <div>
        <Label>OAuth Client Secret</Label>
        <Input type="password" value={oauthClientSecret}
          onChange={(e) => setOauthClientSecret(e.target.value)} />
      </div>
      <div className="md:col-span-3 flex justify-end">
        <Button type="button" onClick={() => m.mutate()} disabled={m.isPending} variant="outline">
          {m.isPending ? "Salvando…" : "Salvar credenciais"}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------- TESTAR CONEXÃO ----------------------- */
function TestConnectionButton({ workspaceId }: { workspaceId: string }) {
  const testFn = useServerFn(testRenaveConnection);
  const m = useMutation({
    mutationFn: async () => testFn({ data: { workspaceId } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(`OAuth OK — token ${res.preview}`);
      else toast.error(`Falha: ${res.error}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button type="button" onClick={() => m.mutate()} disabled={m.isPending} variant="outline">
      <ShieldCheck className="h-4 w-4 mr-1" />{m.isPending ? "Testando…" : "Testar conexão"}
    </Button>
  );
}

/* ----------------------- NF-e ----------------------- */
type NfeConfigRow = {
  environment: "homologacao" | "producao" | null;
  cnpj_emitente: string | null;
  ie_emitente: string | null;
  regime_tributario: number | null;
  serie_padrao: number | null;
  cfop_entrada_padrao: string | null;
  cfop_saida_padrao: string | null;
  natureza_operacao_entrada: string | null;
  natureza_operacao_saida: string | null;
  emit_logradouro: string | null;
  emit_numero: string | null;
  emit_bairro: string | null;
  emit_cep: string | null;
  emit_municipio: string | null;
  emit_ibge: string | null;
  emit_uf: string | null;
  emit_razao_social: string | null;
  emit_nome_fantasia: string | null;
  emit_telefone: string | null;
  is_active: boolean | null;
  has_token_homolog?: boolean;
  has_token_prod?: boolean;
};

function NfeTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(setNfeConfig);
  const testFn = useServerFn(testNfeConnection);

  const { data: cfg } = useQuery({
    queryKey: ["nfe-config", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nfe_config" as never)
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      return (data ?? null) as NfeConfigRow | null;
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["nfe-docs", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nfe_documents" as never)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Array<{
        id: string;
        ref: string | null;
        direction: string;
        environment: string;
        focus_status: string | null;
        chave: string | null;
        numero: string | null;
        serie: string | null;
        xml_url: string | null;
        pdf_url: string | null;
        error_message: string | null;
        created_at: string;
      }>;
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const val = (k: string) => form[k] ?? (cfg?.[k as keyof NfeConfigRow] as string | number | null)?.toString() ?? "";
  const setVal = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const [tokenH, setTokenH] = useState("");
  const [tokenP, setTokenP] = useState("");
  const [env, setEnv] = useState<"homologacao" | "producao">(cfg?.environment ?? "homologacao");
  const [active, setActive] = useState<boolean>(cfg?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          workspaceId,
          environment: env,
          isActive: active,
          tokenHomolog: tokenH || undefined,
          tokenProd: tokenP || undefined,
          cnpjEmitente: val("cnpj_emitente"),
          ieEmitente: val("ie_emitente"),
          regimeTributario: Number(val("regime_tributario") || 1),
          seriePadrao: Number(val("serie_padrao") || 1),
          cfopEntradaPadrao: val("cfop_entrada_padrao") || "1102",
          cfopSaidaPadrao: val("cfop_saida_padrao") || "5102",
          naturezaOperacaoEntrada: val("natureza_operacao_entrada") || "Compra para comercialização",
          naturezaOperacaoSaida: val("natureza_operacao_saida") || "Venda de mercadoria",
          emitLogradouro: val("emit_logradouro"),
          emitNumero: val("emit_numero"),
          emitBairro: val("emit_bairro"),
          emitCep: val("emit_cep"),
          emitMunicipio: val("emit_municipio"),
          emitIbge: val("emit_ibge"),
          emitUf: val("emit_uf"),
          emitRazaoSocial: val("emit_razao_social"),
          emitNomeFantasia: val("emit_nome_fantasia"),
          emitTelefone: val("emit_telefone"),
        },
      });
    },
    onSuccess: () => {
      toast.success("Config NF-e salva");
      setTokenH("");
      setTokenP("");
      qc.invalidateQueries({ queryKey: ["nfe-config", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => testFn({ data: { workspaceId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Focus NFe respondeu ${r.status}`);
      else toast.error(`Falhou (${r.status}): ${r.preview}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Emissor de NF-e (Focus NFe)
            </h3>
            <p className="text-sm text-muted-foreground">
              Emissão automática de NF-e modelo 55 (entrada/saída) integrada ao RENAVE.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={env} onValueChange={(v) => setEnv(v as "homologacao" | "producao")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">Homologação</SelectItem>
                <SelectItem value="producao">Produção</SelectItem>
              </SelectContent>
            </Select>
            <Button variant={active ? "default" : "outline"} onClick={() => setActive(!active)}>
              {active ? "Ativo" : "Inativo"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Token Focus (homologação)</Label><Input type="password" value={tokenH} onChange={(e) => setTokenH(e.target.value)} placeholder={cfg ? "•••••••• (deixe vazio p/ manter)" : ""} /></div>
          <div><Label>Token Focus (produção)</Label><Input type="password" value={tokenP} onChange={(e) => setTokenP(e.target.value)} placeholder={cfg ? "•••••••• (deixe vazio p/ manter)" : ""} /></div>
          <div><Label>CNPJ emitente</Label><Input value={val("cnpj_emitente")} onChange={setVal("cnpj_emitente")} /></div>
          <div><Label>IE emitente</Label><Input value={val("ie_emitente")} onChange={setVal("ie_emitente")} /></div>
          <div><Label>Razão social</Label><Input value={val("emit_razao_social")} onChange={setVal("emit_razao_social")} /></div>
          <div><Label>Nome fantasia</Label><Input value={val("emit_nome_fantasia")} onChange={setVal("emit_nome_fantasia")} /></div>
          <div><Label>Regime tributário (1=SN, 2=SN excesso, 3=Normal)</Label><Input type="number" value={val("regime_tributario")} onChange={setVal("regime_tributario")} /></div>
          <div><Label>Série padrão</Label><Input type="number" value={val("serie_padrao")} onChange={setVal("serie_padrao")} /></div>
          <div><Label>CFOP entrada</Label><Input value={val("cfop_entrada_padrao")} onChange={setVal("cfop_entrada_padrao")} placeholder="1102" /></div>
          <div><Label>CFOP saída</Label><Input value={val("cfop_saida_padrao")} onChange={setVal("cfop_saida_padrao")} placeholder="5102" /></div>
          <div className="col-span-2"><Label>Natureza da operação (entrada)</Label><Input value={val("natureza_operacao_entrada")} onChange={setVal("natureza_operacao_entrada")} /></div>
          <div className="col-span-2"><Label>Natureza da operação (saída)</Label><Input value={val("natureza_operacao_saida")} onChange={setVal("natureza_operacao_saida")} /></div>
          <div className="col-span-2"><Label>Logradouro</Label><Input value={val("emit_logradouro")} onChange={setVal("emit_logradouro")} /></div>
          <div><Label>Número</Label><Input value={val("emit_numero")} onChange={setVal("emit_numero")} /></div>
          <div><Label>Bairro</Label><Input value={val("emit_bairro")} onChange={setVal("emit_bairro")} /></div>
          <div><Label>CEP</Label><Input value={val("emit_cep")} onChange={setVal("emit_cep")} /></div>
          <div><Label>Município</Label><Input value={val("emit_municipio")} onChange={setVal("emit_municipio")} /></div>
          <div><Label>Cód. IBGE município</Label><Input value={val("emit_ibge")} onChange={setVal("emit_ibge")} /></div>
          <div><Label>UF</Label><Input value={val("emit_uf")} onChange={setVal("emit_uf")} maxLength={2} /></div>
          <div><Label>Telefone</Label><Input value={val("emit_telefone")} onChange={setVal("emit_telefone")} /></div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-brand text-primary-foreground border-0">
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            {test.isPending ? "Testando…" : "Testar conexão"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Webhook do Focus (opcional, recomendado): configure no painel do Focus para{" "}
          <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/public/webhooks/focus-nfe</code>{" "}
          com header <code>x-focus-token</code> = valor da secret <code>FOCUS_NFE_WEBHOOK_TOKEN</code>.
        </p>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Notas emitidas</h3>
        <EmitNfeDialog workspaceId={workspaceId} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Ref</th>
                <th className="text-left p-3">Direção</th>
                <th className="text-left p-3">Ambiente</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Nº</th>
                <th className="text-left p-3">Chave</th>
                <th className="text-left p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(docs ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-3 text-xs">{new Date(d.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-mono text-xs">{d.ref}</td>
                  <td className="p-3">{d.direction}</td>
                  <td className="p-3">{d.environment}</td>
                  <td className="p-3"><Badge variant={d.focus_status === "autorizado" ? "default" : "outline"}>{d.focus_status ?? "—"}</Badge></td>
                  <td className="p-3">{d.numero ?? "—"}</td>
                  <td className="p-3 font-mono text-[10px]">{d.chave ?? (d.error_message ? <span className="text-red-500">{d.error_message.slice(0, 60)}</span> : "—")}</td>
                  <td className="p-3 flex gap-2">
                    <NfePollButton docId={d.id} workspaceId={workspaceId} />
                    {d.pdf_url && <a className="text-primary underline text-xs" href={d.pdf_url} target="_blank" rel="noreferrer">DANFE</a>}
                    {d.xml_url && <a className="text-primary underline text-xs" href={d.xml_url} target="_blank" rel="noreferrer">XML</a>}
                  </td>
                </tr>
              ))}
              {(!docs || docs.length === 0) && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">Nenhuma nota emitida</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function NfePollButton({ docId, workspaceId }: { docId: string; workspaceId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(pollNfeStatus);
  const m = useMutation({
    mutationFn: async () => fn({ data: { docId } }),
    onSuccess: (r) => {
      toast.success(`Status: ${r.status}`);
      qc.invalidateQueries({ queryKey: ["nfe-docs", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => m.mutate()} disabled={m.isPending}>
      <RefreshCw className={`h-3 w-3 ${m.isPending ? "animate-spin" : ""}`} />
    </Button>
  );
}

function EmitNfeDialog({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(emitNfe);
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [direction, setDirection] = useState<"entrada" | "saida">("entrada");
  const [valor, setValor] = useState<string>("");
  const [c, setC] = useState({
    tipo: "PJ" as "PF" | "PJ",
    nome: "", cpf: "", cnpj: "", ie: "ISENTO", email: "", telefone: "",
    logradouro: "", numero: "", bairro: "", cep: "", municipio: "", ibge: "", uf: "",
  });

  const { data: vehicles } = useQuery({
    queryKey: ["renave-vehicles-picker", workspaceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("renave_vehicles")
        .select("id, placa, chassi, marca, modelo")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: open,
  });

  const emit = useMutation({
    mutationFn: async () => {
      const contraparte = c.tipo === "PF"
        ? { ...c, cnpj: undefined, ie: undefined }
        : { ...c, cpf: undefined };
      return fn({
        data: {
          workspaceId,
          vehicleId,
          direction,
          valor: Number(valor),
          contraparte,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Emissão ${r.status}${r.chave ? ` — chave ${r.chave.slice(0, 8)}…` : ""}`);
      qc.invalidateQueries({ queryKey: ["nfe-docs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["renave-vehicles", workspaceId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setF = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC({ ...c, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-brand text-primary-foreground border-0">
          <FileText className="h-4 w-4 mr-1" /> Emitir NF-e
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Emitir NF-e</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Direção</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "entrada" | "saida")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada (compra)</SelectItem>
                <SelectItem value="saida">Saída (venda)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Valor total (R$)</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Veículo</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {(vehicles ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {[v.placa, v.chassi, v.marca, v.modelo].filter(Boolean).join(" • ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 border-t border-border pt-3 mt-2">
            <p className="text-sm font-medium mb-2">
              {direction === "entrada" ? "Fornecedor (destinatário no XML de entrada)" : "Cliente"}
            </p>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={c.tipo} onValueChange={(v) => setC({ ...c, tipo: v as "PF" | "PJ" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                <SelectItem value="PF">Pessoa Física</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Nome / Razão social</Label><Input value={c.nome} onChange={setF("nome")} /></div>
          {c.tipo === "PJ" ? (
            <>
              <div><Label>CNPJ</Label><Input value={c.cnpj} onChange={setF("cnpj")} /></div>
              <div><Label>IE</Label><Input value={c.ie} onChange={setF("ie")} /></div>
            </>
          ) : (
            <div><Label>CPF</Label><Input value={c.cpf} onChange={setF("cpf")} /></div>
          )}
          <div><Label>Email</Label><Input value={c.email} onChange={setF("email")} /></div>
          <div><Label>Telefone</Label><Input value={c.telefone} onChange={setF("telefone")} /></div>
          <div className="col-span-2"><Label>Logradouro</Label><Input value={c.logradouro} onChange={setF("logradouro")} /></div>
          <div><Label>Número</Label><Input value={c.numero} onChange={setF("numero")} /></div>
          <div><Label>Bairro</Label><Input value={c.bairro} onChange={setF("bairro")} /></div>
          <div><Label>CEP</Label><Input value={c.cep} onChange={setF("cep")} /></div>
          <div><Label>Município</Label><Input value={c.municipio} onChange={setF("municipio")} /></div>
          <div><Label>Cód. IBGE</Label><Input value={c.ibge} onChange={setF("ibge")} /></div>
          <div><Label>UF</Label><Input value={c.uf} onChange={setF("uf")} maxLength={2} /></div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => emit.mutate()}
            disabled={!vehicleId || !valor || !c.nome || emit.isPending}
            className="gradient-brand text-primary-foreground border-0"
          >
            {emit.isPending ? "Emitindo…" : "Emitir agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

