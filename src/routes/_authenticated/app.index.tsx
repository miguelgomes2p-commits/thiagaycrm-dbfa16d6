import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import {
  TrendingUp, Users, MessageSquare, Trophy, XCircle, DollarSign,
  Target, Clock, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

function useDashboard(workspaceId: string | undefined) {
  return useQuery({
    enabled: !!workspaceId,
    queryKey: ["dashboard", workspaceId],
    queryFn: async () => {
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [leads, contacts, convs, msgs] = await Promise.all([
        supabase.from("leads").select("id, value, stage_id, source, created_at, won_at, lost_at, pipeline_stages:stage_id(type, name)").eq("workspace_id", workspaceId!),
        supabase.from("contacts").select("id").eq("workspace_id", workspaceId!),
        supabase.from("conversations").select("id, status, channel").eq("workspace_id", workspaceId!),
        supabase.from("messages").select("conversation_id, direction, created_at").eq("workspace_id", workspaceId!).gte("created_at", since30).order("created_at", { ascending: true }).limit(5000),
      ]);

      const l = leads.data ?? [];
      const won = l.filter((r) => (r.pipeline_stages as { type?: string } | null)?.type === "won");
      const lost = l.filter((r) => (r.pipeline_stages as { type?: string } | null)?.type === "lost");
      const open = l.filter((r) => (r.pipeline_stages as { type?: string } | null)?.type === "open");
      const revenue_won = won.reduce((s, r) => s + Number(r.value ?? 0), 0);
      const revenue_forecast = open.reduce((s, r) => s + Number(r.value ?? 0), 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const newToday = l.filter((r) => new Date(r.created_at) >= today).length;
      const convOpen = (convs.data ?? []).filter((c) => c.status === "open").length;

      // Source breakdown
      const sourceMap: Record<string, number> = {};
      l.forEach((r) => { const s = r.source ?? "Outros"; sourceMap[s] = (sourceMap[s] ?? 0) + 1; });
      const bySource = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));

      // Sales per month (last 6)
      const months: { name: string; sales: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
        const label = d.toLocaleDateString("pt-BR", { month: "short" });
        const total = won.filter((r) => {
          if (!r.won_at) return false;
          const wd = new Date(r.won_at);
          return wd.getMonth() === d.getMonth() && wd.getFullYear() === d.getFullYear();
        }).reduce((s, r) => s + Number(r.value ?? 0), 0);
        months.push({ name: label, sales: total });
      }

      // Channels
      const chanMap: Record<string, number> = {};
      (convs.data ?? []).forEach((c) => { chanMap[c.channel] = (chanMap[c.channel] ?? 0) + 1; });
      const byChannel = Object.entries(chanMap).map(([name, value]) => ({ name, value }));

      // Response times (last 30 days): pair consecutive messages per conversation.
      const byConv: Record<string, { direction: string; t: number }[]> = {};
      (msgs.data ?? []).forEach((m) => {
        if (m.direction !== "inbound" && m.direction !== "outbound") return;
        (byConv[m.conversation_id] ??= []).push({ direction: m.direction, t: new Date(m.created_at).getTime() });
      });
      const leadDeltas: number[] = [];
      const agentDeltas: number[] = [];
      const MAX_GAP = 24 * 60 * 60 * 1000; // ignora pausas > 24h
      Object.values(byConv).forEach((list) => {
        list.sort((a, b) => a.t - b.t);
        for (let i = 1; i < list.length; i++) {
          const prev = list[i - 1]!; const cur = list[i]!;
          if (prev.direction === cur.direction) continue;
          const delta = cur.t - prev.t;
          if (delta <= 0 || delta > MAX_GAP) continue;
          if (cur.direction === "inbound") leadDeltas.push(delta);
          else agentDeltas.push(delta);
        }
      });
      const avg = (arr: number[]) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);

      return {
        total: l.length,
        newToday,
        openConvs: convOpen,
        won: won.length,
        lost: lost.length,
        revenue_won,
        revenue_forecast,
        conversion: l.length ? (won.length / l.length) * 100 : 0,
        contacts: contacts.data?.length ?? 0,
        bySource,
        months,
        byChannel,
        leadResponseMs: avg(leadDeltas),
        agentResponseMs: avg(agentDeltas),
        leadResponseCount: leadDeltas.length,
        agentResponseCount: agentDeltas.length,
      };

    },
  });
}

function StatCard({ icon: Icon, label, value, sub, tone = "default" }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
}) {
  const toneCls = {
    default: "bg-surface text-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
    brand: "bg-primary/10 text-primary",
  }[tone];
  return (
    <div className="card-elevated p-5 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={cn("h-8 w-8 rounded-lg grid place-items-center", toneCls)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const CHART_COLORS = ["oklch(0.68 0.22 285)", "oklch(0.72 0.19 155)", "oklch(0.75 0.18 200)", "oklch(0.80 0.17 75)", "oklch(0.70 0.20 340)"];

function Dashboard() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const { data, isLoading } = useDashboard(ws?.id);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do seu funil e atividades.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total de leads" value={String(data?.total ?? 0)} sub={`${data?.contacts ?? 0} contatos`} tone="brand" />
        <StatCard icon={TrendingUp} label="Novos hoje" value={String(data?.newToday ?? 0)} tone="success" />
        <StatCard icon={MessageSquare} label="Conversas abertas" value={String(data?.openConvs ?? 0)} tone="warning" />
        <StatCard icon={Trophy} label="Ganhos" value={String(data?.won ?? 0)} sub={brl(data?.revenue_won ?? 0)} tone="success" />
        <StatCard icon={XCircle} label="Perdidos" value={String(data?.lost ?? 0)} tone="danger" />
        <StatCard icon={DollarSign} label="Receita prevista" value={brl(data?.revenue_forecast ?? 0)} tone="brand" />
        <StatCard icon={Target} label="Conversão" value={`${(data?.conversion ?? 0).toFixed(1)}%`} tone="success" />
        <StatCard icon={Clock} label="Ciclo médio" value="—" sub="Em breve" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-elevated p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Vendas por mês</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data?.months ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
                <XAxis dataKey="name" stroke="oklch(0.68 0.02 265)" fontSize={12} />
                <YAxis stroke="oklch(0.68 0.02 265)" fontSize={12} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.02 265)", border: "1px solid oklch(1 0 0 / 0.1)", borderRadius: 8 }} />
                <Bar dataKey="sales" fill="oklch(0.68 0.22 285)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card-elevated p-5">
          <h3 className="font-semibold mb-4">Leads por origem</h3>
          <div className="h-64">
            {(data?.bySource ?? []).length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados ainda</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data!.bySource} dataKey="value" nameKey="name" outerRadius={80} innerRadius={45}>
                    {data!.bySource.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "oklch(0.20 0.02 265)", border: "1px solid oklch(1 0 0 / 0.1)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="card-elevated p-5">
        <h3 className="font-semibold mb-4">Conversas por canal</h3>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={data?.byChannel ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
              <XAxis dataKey="name" stroke="oklch(0.68 0.02 265)" fontSize={12} />
              <YAxis stroke="oklch(0.68 0.02 265)" fontSize={12} />
              <Tooltip contentStyle={{ background: "oklch(0.20 0.02 265)", border: "1px solid oklch(1 0 0 / 0.1)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="value" stroke="oklch(0.75 0.18 200)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isLoading && <div className="text-center text-sm text-muted-foreground py-4">Carregando…</div>}
    </div>
  );
}
