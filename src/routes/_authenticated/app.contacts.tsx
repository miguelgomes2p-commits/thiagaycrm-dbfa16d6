import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Building2, User as UserIcon, Search, Mail, Phone, Pencil, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { refreshContactNames } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/app/contacts")({
  component: ContactsPage,
});

type Contact = {
  id: string; workspace_id: string; type: "person" | "company" | "group";
  name: string; email?: string | null; phone?: string | null; whatsapp?: string | null;
  document?: string | null; birthdate?: string | null; company_name?: string | null;
  job_title?: string | null; address?: string | null; city?: string | null; state?: string | null;
  zipcode?: string | null; segment?: string | null; responsible?: string | null;
  employees?: string | null; revenue?: string | null; notes?: string | null;
  tags?: string[] | null;
};

function ContactsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const isAdmin = ws?.role === "owner" || ws?.role === "admin" || ws?.role === "support";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [type, setType] = useState<"person" | "company">("person");
  const refreshFn = useServerFn(refreshContactNames);

  const contacts = useQuery({
    enabled: !!ws?.id,
    queryKey: ["contacts", ws?.id, q, isAdmin],
    queryFn: async () => {
      let query = supabase.from("contacts").select("*").eq("workspace_id", ws!.id).order("created_at", { ascending: false }).limit(200);
      if (!isAdmin) {
        const { data: s } = await supabase.auth.getSession();
        const uid = s.session?.user?.id;
        if (!uid) return [] as Contact[];
        query = query.eq("owner_id", uid);
      }
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });


  const refreshM = useMutation({
    mutationFn: () => refreshFn({ data: { workspaceId: ws!.id } }),
    onSuccess: (r) => {
      toast.success(`Nomes corrigidos: ${r.updated} contato(s). Agora edite manualmente com o nome real.`);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew(t: "person" | "company") {
    setEditing(null); setType(t); setOpen(true);
  }
  function openEdit(c: Contact) {
    setEditing(c); setType(c.type === "company" ? "company" : "person"); setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ws) return;
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { workspace_id: ws.id, type };
    fd.forEach((v, k) => {
      if (k === "tags") return;
      payload[k] = v === "" ? null : v;
    });
    const tags = fd.get("tags");
    payload.tags = tags ? String(tags).split(",").map((s) => s.trim()).filter(Boolean) : null;

    const { error } = editing
      ? await supabase.from("contacts").update(payload as any).eq("id", editing.id)
      : await supabase.from("contacts").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Contato atualizado" : "Contato criado");
    qc.invalidateQueries({ queryKey: ["contacts"] });
    setOpen(false); setEditing(null);
  }

  async function del(c: Contact) {
    if (!confirm(`Excluir contato "${c.name}"? Suas conversas ficarão sem contato vinculado.`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Contato excluído");
    qc.invalidateQueries({ queryKey: ["contacts"] });
  }

  const v = (name: keyof Contact) => (editing?.[name] as string | undefined) ?? "";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">Pessoas, empresas e grupos. Clique em um contato para editar.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="gradient-brand text-primary-foreground border-0" onClick={() => openNew("person")}>
            <Plus className="h-4 w-4 mr-1" /> Novo contato
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar: ${editing.name}` : "Novo contato"}</DialogTitle>
          </DialogHeader>
          <Tabs value={type} onValueChange={(t) => setType(t as "person" | "company")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="person" disabled={!!editing && editing.type === "company"}>
                <UserIcon className="h-4 w-4 mr-1" /> Pessoa
              </TabsTrigger>
              <TabsTrigger value="company" disabled={!!editing && editing.type === "person"}>
                <Building2 className="h-4 w-4 mr-1" /> Empresa
              </TabsTrigger>
            </TabsList>
            <form onSubmit={submit} key={editing?.id ?? "new"}>
              <TabsContent value="person" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nome *</Label><Input name="name" required defaultValue={v("name")} /></div>
                  <div><Label>Email</Label><Input name="email" type="email" defaultValue={v("email")} /></div>
                  <div><Label>Telefone</Label><Input name="phone" defaultValue={v("phone")} /></div>
                  <div><Label>WhatsApp</Label><Input name="whatsapp" defaultValue={v("whatsapp")} /></div>
                  <div><Label>CPF</Label><Input name="document" defaultValue={v("document")} /></div>
                  <div><Label>Nascimento</Label><Input name="birthdate" type="date" defaultValue={v("birthdate")} /></div>
                  <div><Label>Empresa</Label><Input name="company_name" defaultValue={v("company_name")} /></div>
                  <div><Label>Cargo</Label><Input name="job_title" defaultValue={v("job_title")} /></div>
                </div>
                <div><Label>Endereço</Label><Input name="address" defaultValue={v("address")} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Cidade</Label><Input name="city" defaultValue={v("city")} /></div>
                  <div><Label>Estado</Label><Input name="state" defaultValue={v("state")} /></div>
                  <div><Label>CEP</Label><Input name="zipcode" defaultValue={v("zipcode")} /></div>
                </div>
                <div><Label>Tags (vírgula)</Label><Input name="tags" defaultValue={(editing?.tags ?? []).join(", ")} placeholder="vip, lead-quente" /></div>
                <div><Label>Observações</Label><Input name="notes" defaultValue={v("notes")} /></div>
              </TabsContent>
              <TabsContent value="company" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Razão social *</Label><Input name="name" required defaultValue={v("name")} /></div>
                  <div><Label>Nome fantasia</Label><Input name="company_name" defaultValue={v("company_name")} /></div>
                  <div><Label>CNPJ</Label><Input name="document" defaultValue={v("document")} /></div>
                  <div><Label>Responsável</Label><Input name="responsible" defaultValue={v("responsible")} /></div>
                  <div><Label>Email</Label><Input name="email" type="email" defaultValue={v("email")} /></div>
                  <div><Label>Telefone</Label><Input name="phone" defaultValue={v("phone")} /></div>
                  <div><Label>WhatsApp</Label><Input name="whatsapp" defaultValue={v("whatsapp")} /></div>
                  <div><Label>Segmento</Label><Input name="segment" defaultValue={v("segment")} /></div>
                </div>
                <div><Label>Tags</Label><Input name="tags" defaultValue={(editing?.tags ?? []).join(", ")} /></div>
              </TabsContent>
              <Button type="submit" className="w-full mt-4 gradient-brand text-primary-foreground border-0">
                {editing ? "Salvar alterações" : "Criar contato"}
              </Button>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="card-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface/50 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Contato</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Empresa</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Tags</th>
              <th className="text-right px-4 py-3 w-32">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.data?.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Nenhum contato ainda.</td></tr>
            )}
            {contacts.data?.map((c) => (
              <tr key={c.id} className="hover:bg-surface/30 transition-colors cursor-pointer" onClick={() => openEdit(c)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className={c.type === "company" ? "bg-accent/20 text-accent" : c.type === "group" ? "bg-info/20 text-info" : "bg-primary/20 text-primary"}>
                        {c.type === "company" ? <Building2 className="h-4 w-4" /> : c.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{c.type === "company" ? "Empresa" : c.type === "group" ? "Grupo" : "Pessoa"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                  {c.company_name || c.segment || "—"}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).map((t: string) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => del(c)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
