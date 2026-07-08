import { createFileRoute } from "@tanstack/react-router";
import { useMyWorkspaces, useCurrentProfile } from "@/hooks/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, Palette, Bell, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const { data: profile } = useCurrentProfile();
  const ws = workspaces?.[0];

  const membersQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["members", ws?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("role, user_id, profiles:user_id(full_name, avatar_url)")
        .eq("workspace_id", ws!.id);
      return data ?? [];
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu workspace, equipe e preferências.</p>
      </div>

      <section className="card-elevated p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Empresa</h2>
        </div>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{ws?.name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Slug</dt><dd className="font-mono text-xs">{ws?.slug ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Seu papel</dt><dd className="font-medium capitalize">{ws?.role ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="card-elevated p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Equipe ({membersQ.data?.length ?? 0})</h2>
        </div>
        <div className="divide-y divide-border">
          {membersQ.data?.map((m) => {
            const p = m.profiles as { full_name?: string } | null;
            return (
              <div key={m.user_id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{p?.full_name ?? "Usuário"}</div>
                  <div className="text-xs text-muted-foreground">Membro</div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary capitalize">{m.role}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-elevated p-6">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Perfil</h2>
        </div>
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{profile?.full_name ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="card-elevated p-6 opacity-60">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Automações, Integrações & API</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Módulos avançados (WhatsApp Business API, automações visuais tipo n8n, propostas, financeiro, marketing, API keys, webhooks)
          serão adicionados em próximas iterações. O fundamento multi-tenant já está pronto para receber cada um deles.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["WhatsApp API", "Automações", "Propostas", "Financeiro", "Marketing", "Relatórios", "API Keys", "Webhooks"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-border text-muted-foreground">
              <KeyRound className="h-3 w-3" /> {f}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
