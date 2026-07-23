import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listAllUsers, deleteUserById, listAllWorkspaces, deleteWorkspaceById, updateWorkspaceFeatures } from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, Trash2, Search, Users, Building2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SUPER_ADMIN_EMAIL = "miguelgomes2p@gmail.com";

export const Route = createFileRoute("/_authenticated/app/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const listUsersFn = useServerFn(listAllUsers);
  const delUserFn = useServerFn(deleteUserById);
  const listWsFn = useServerFn(listAllWorkspaces);
  const delWsFn = useServerFn(deleteWorkspaceById);
  const updateFeaturesFn = useServerFn(updateWorkspaceFeatures);

  const [q, setQ] = useState("");
  const [confirmUser, setConfirmUser] = useState<{ id: string; email: string } | null>(null);
  const [confirmWs, setConfirmWs] = useState<{ id: string; name: string } | null>(null);

  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => listUsersFn() });
  const wsQ = useQuery({ queryKey: ["admin-workspaces"], queryFn: () => listWsFn() });

  const delUserM = useMutation({
    mutationFn: (userId: string) => delUserFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      setConfirmUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delWsM = useMutation({
    mutationFn: (workspaceId: string) => delWsFn({ data: { workspaceId } }),
    onSuccess: () => {
      toast.success("Workspace excluído");
      qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
      setConfirmWs(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredUsers = (usersQ.data ?? []).filter((u) =>
    !q || (u.email ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (u.full_name ?? "").toLowerCase().includes(q.toLowerCase())
  );
  const filteredWs = (wsQ.data ?? []).filter((w) =>
    !q || w.name.toLowerCase().includes(q.toLowerCase()) || w.slug.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-destructive/10 grid place-items-center">
          <ShieldAlert className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Global</h1>
          <p className="text-sm text-muted-foreground">
            Área restrita — gerencie todos os usuários e workspaces da plataforma.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="workspaces">
        <TabsList>
          <TabsTrigger value="workspaces"><Building2 className="h-4 w-4 mr-1" /> Workspaces ({wsQ.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Usuários ({usersQ.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces" className="mt-4">
          <div className="card-elevated p-4">
            {wsQ.isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
            <div className="divide-y divide-border">
              {filteredWs.map((w) => (
                <div key={w.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{w.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{w.slug}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      <span>{w.member_count} membro(s)</span>
                      {Object.entries(w.roles).map(([r, n]) => (
                        <span key={r} className="capitalize">{r}: {n as number}</span>
                      ))}
                      <span>criado {new Date(w.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        RENAVE
                        <Switch
                          checked={!!w.feature_renave}
                          onCheckedChange={async (v) => {
                            await updateFeaturesFn({ data: { workspaceId: w.id, feature_renave: v } });
                            qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
                            qc.invalidateQueries({ queryKey: ["my-workspaces"] });
                            toast.success("Atualizado");
                          }}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        Assistente IA
                        <Switch
                          checked={!!w.feature_ai}
                          onCheckedChange={async (v) => {
                            await updateFeaturesFn({ data: { workspaceId: w.id, feature_ai: v } });
                            qc.invalidateQueries({ queryKey: ["admin-workspaces"] });
                            qc.invalidateQueries({ queryKey: ["my-workspaces"] });
                            toast.success("Atualizado");
                          }}
                        />
                      </label>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setConfirmWs({ id: w.id, name: w.name })}
                      disabled={delWsM.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                  </div>
                </div>
              ))}
              {!wsQ.isLoading && filteredWs.length === 0 && (
                <div className="py-6 text-sm text-muted-foreground text-center">Nenhum workspace.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <div className="card-elevated p-4">
            {usersQ.isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
            <div className="divide-y divide-border">
              {filteredUsers.map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {u.full_name ?? "—"}{" "}
                      {u.email?.toLowerCase() === SUPER_ADMIN_EMAIL && (
                        <span className="ml-2 text-[10px] uppercase px-2 py-0.5 rounded bg-primary/15 text-primary">Super Admin</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email ?? u.id}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Criado {new Date(u.created_at).toLocaleDateString("pt-BR")} · Último acesso {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    disabled={u.email?.toLowerCase() === SUPER_ADMIN_EMAIL || delUserM.isPending}
                    onClick={() => setConfirmUser({ id: u.id, email: u.email ?? u.id })}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir
                  </Button>
                </div>
              ))}
              {!usersQ.isLoading && filteredUsers.length === 0 && (
                <div className="py-6 text-sm text-muted-foreground text-center">Nenhum usuário.</div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmUser} onOpenChange={(o) => !o && setConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Ação irreversível. <strong>{confirmUser?.email}</strong> perderá acesso e seus workspaces próprios serão removidos em cascata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmUser && delUserM.mutate(confirmUser.id)}
              disabled={delUserM.isPending}
            >
              {delUserM.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmWs} onOpenChange={(o) => !o && setConfirmWs(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              Ação irreversível. Workspace <strong>{confirmWs?.name}</strong> e todos os seus dados (contatos, conversas, mensagens, pipelines, WhatsApps, etc.) serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmWs && delWsM.mutate(confirmWs.id)}
              disabled={delWsM.isPending}
            >
              {delWsM.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
