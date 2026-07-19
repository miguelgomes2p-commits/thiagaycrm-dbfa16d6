import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listAllUsers, deleteUserById } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Trash2, Search } from "lucide-react";
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
  const listFn = useServerFn(listAllUsers);
  const delFn = useServerFn(deleteUserById);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; email: string } | null>(null);

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
  });

  const delM = useMutation({
    mutationFn: (userId: string) => delFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (usersQ.data ?? []).filter((u) =>
    !q || (u.email ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (u.full_name ?? "").toLowerCase().includes(q.toLowerCase())
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
            Área restrita — gerencie todos os usuários da plataforma.
          </p>
        </div>
      </div>

      <div className="card-elevated p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email ou nome..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        {usersQ.isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
        {usersQ.error && (
          <div className="text-sm text-destructive">
            Erro: {(usersQ.error as Error).message}
          </div>
        )}

        <div className="divide-y divide-border">
          {filtered.map((u) => (
            <div key={u.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {u.full_name ?? "—"}{" "}
                  {u.email?.toLowerCase() === SUPER_ADMIN_EMAIL && (
                    <span className="ml-2 text-[10px] uppercase px-2 py-0.5 rounded bg-primary/15 text-primary">
                      Super Admin
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email ?? u.id}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Criado {new Date(u.created_at).toLocaleDateString("pt-BR")} ·{" "}
                  Último acesso {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "—"}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={u.email?.toLowerCase() === SUPER_ADMIN_EMAIL || delM.isPending}
                onClick={() => setConfirm({ id: u.id, email: u.email ?? u.id })}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            </div>
          ))}
          {!usersQ.isLoading && filtered.length === 0 && (
            <div className="py-6 text-sm text-muted-foreground text-center">Nenhum usuário encontrado.</div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O usuário <strong>{confirm?.email}</strong> perderá acesso imediato e seus dados vinculados (workspaces próprios, memberships) serão removidos conforme as regras de cascata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirm && delM.mutate(confirm.id)}
              disabled={delM.isPending}
            >
              {delM.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
