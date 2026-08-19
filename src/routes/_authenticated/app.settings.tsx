import { createFileRoute } from "@tanstack/react-router";
import { useMyWorkspaces, useCurrentProfile } from "@/hooks/useWorkspace";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, Palette, UserPlus, Trash2, Shield, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listWorkspaceMembers, inviteMemberByEmail, listWorkspaceInvitations, updateMemberRole, removeMember, updateMemberQueueSettings } from "@/lib/workspace.functions";
import { Switch } from "@/components/ui/switch";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";


export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
});

type Role = "owner" | "admin" | "manager" | "agent";
const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner (dono)",
  admin: "Admin (gerencia tudo, exceto excluir workspace)",
  manager: "Manager (gerencia leads, conversas, equipe operacional)",
  agent: "Agent (atende conversas, edita seus leads)",
};

function SettingsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const { data: profile } = useCurrentProfile();
  const ws = workspaces?.[0];
  const qc = useQueryClient();

  const listFn = useServerFn(listWorkspaceMembers);
  const inviteFn = useServerFn(inviteMemberByEmail);
  const listInvitesFn = useServerFn(listWorkspaceInvitations);
  const updFn = useServerFn(updateMemberRole);
  const rmFn = useServerFn(removeMember);
  const queueFn = useServerFn(updateMemberQueueSettings);

  const membersQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["ws-members-full", ws?.id],
    queryFn: () => listFn({ data: { workspaceId: ws!.id } }),
  });

  const canManage = ws?.role === "owner" || ws?.role === "admin";
  const isShared = ws?.workspace_mode === "shared";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [lastInviteLink, setLastInviteLink] = useState("");

  const invitationsQ = useQuery({
    enabled: !!ws?.id && canManage,
    queryKey: ["ws-invitations", ws?.id],
    queryFn: () => listInvitesFn({ data: { workspaceId: ws!.id } }),
  });

  const inviteM = useMutation({
    mutationFn: () => inviteFn({ data: { workspaceId: ws!.id, email, role } }),
    onSuccess: (result) => {
      setLastInviteLink(result.inviteLink);
      if (result.emailSent) {
        toast.success("Convite enviado por e-mail");
      } else {
        toast.warning("Convite gerado. Copie o link e envie ao membro.");
      }
      setEmail(""); setRole("agent");
      qc.invalidateQueries({ queryKey: ["ws-invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function copyInviteLink(link = lastInviteLink) {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  }

  const updM = useMutation({
    mutationFn: (p: { userId: string; role: Role }) =>
      updFn({ data: { workspaceId: ws!.id, ...p } }),
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["ws-members-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const queueM = useMutation({
    mutationFn: (p: { userId: string; accepts_new_leads?: boolean; is_active?: boolean }) =>
      queueFn({ data: { workspaceId: ws!.id, ...p } }),
    onSuccess: () => {
      toast.success("Fila atualizada");
      qc.invalidateQueries({ queryKey: ["ws-members-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rmM = useMutation({
    mutationFn: (userId: string) => rmFn({ data: { workspaceId: ws!.id, userId } }),
    onSuccess: () => {
      toast.success("Membro removido");
      qc.invalidateQueries({ queryKey: ["ws-members-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie seu workspace, equipe e permissões.</p>
        </div>
        <InstallAppButton />
      </div>


      <section className="card-elevated p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Empresa</h2>
        </div>
        <dl className="grid sm:grid-cols-3 gap-4 text-sm">
          <div><dt className="text-muted-foreground">Nome</dt><dd className="font-medium">{ws?.name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Slug</dt><dd className="font-mono text-xs">{ws?.slug ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Seu papel</dt><dd className="font-medium capitalize">{ws?.role ?? "—"}</dd></div>
          <div className="sm:col-span-3">
            <dt className="text-muted-foreground">Modo de atendimento</dt>
            <dd className="font-medium">
              {isShared ? "Compartilhado — WhatsApp único com distribuição automática" : "Individual — cada vendedor com seu próprio WhatsApp"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card-elevated p-6">
        <div className="flex items-center gap-3 mb-4">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Equipe ({membersQ.data?.length ?? 0})</h2>
        </div>

        {canManage && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (email.trim()) inviteM.mutate(); }}
            className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-lg bg-surface/40 border border-border"
          >
            <div className="flex-1">
              <Label className="text-xs">Email do convidado</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="fulano@empresa.com" required />
            </div>
            <div className="sm:w-56">
              <Label className="text-xs">Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin", "manager", "agent"] as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviteM.isPending} className="gradient-brand text-primary-foreground border-0 sm:self-end">
              <UserPlus className="h-4 w-4 mr-1" /> {inviteM.isPending ? "Gerando..." : "Convidar"}
            </Button>
          </form>
        )}

        {lastInviteLink && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" /> Convite pronto
            </div>
            <div className="mt-2 flex gap-2">
              <Input value={lastInviteLink} readOnly className="h-8 text-xs font-mono" />
              <Button type="button" size="sm" variant="outline" onClick={() => copyInviteLink()}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y divide-border">
          {membersQ.isLoading && <div className="py-3 text-sm text-muted-foreground">Carregando membros...</div>}
          {membersQ.data?.map((m) => (
            <div key={m.user_id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{m.full_name ?? "Usuário"}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email ?? m.user_id}</div>
              </div>
              <div className="flex items-center gap-2">
                {canManage && m.role !== "owner" ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => updM.mutate({ userId: m.user_id, role: v as Role })}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["admin", "manager", "agent"] as Role[]).map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary capitalize inline-flex items-center gap-1">
                    <Shield className="h-3 w-3" />{m.role}
                  </span>
                )}
                {canManage && isShared && m.role !== "owner" && m.role !== "admin" && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Switch
                      checked={m.accepts_new_leads !== false}
                      onCheckedChange={(v) => queueM.mutate({ userId: m.user_id, accepts_new_leads: v })}
                    />
                    Recebe leads
                  </label>
                )}
                {canManage && m.role !== "owner" && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => confirm(`Remover ${m.email ?? m.full_name} do workspace?`) && rmM.mutate(m.user_id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {!canManage && (
          <p className="text-xs text-muted-foreground mt-3">
            Apenas owner/admin do workspace podem adicionar ou remover membros.
          </p>
        )}

        {canManage && (invitationsQ.data?.length ?? 0) > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Convites recentes</div>
            <div className="space-y-2">
              {invitationsQ.data?.map((inv) => {
                const accepted = !!inv.accepted_at;
                const expired = !accepted && inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface/30 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{inv.email}</div>
                      <div className="text-muted-foreground">{inv.role}</div>
                    </div>
                    <span className={accepted ? "text-success" : expired ? "text-destructive" : "text-amber-400"}>
                      {accepted ? "aceito" : expired ? "expirado" : "pendente"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
    </div>
  );
}
