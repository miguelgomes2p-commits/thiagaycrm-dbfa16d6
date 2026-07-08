import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Building2, User as UserIcon, Search, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/app/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"person" | "company">("person");

  const contacts = useQuery({
    enabled: !!ws?.id,
    queryKey: ["contacts", ws?.id, q],
    queryFn: async () => {
      let query = supabase.from("contacts").select("*").eq("workspace_id", ws!.id).order("created_at", { ascending: false }).limit(100);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ws) return;
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { workspace_id: ws.id, type };
    fd.forEach((v, k) => { if (v && v !== "") payload[k] = v; });
    if (fd.get("tags")) payload.tags = String(fd.get("tags")).split(",").map((s) => s.trim()).filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("contacts").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Contato criado");
    qc.invalidateQueries({ queryKey: ["contacts"] });
    setOpen(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">Pessoas físicas e empresas.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-brand text-primary-foreground border-0"><Plus className="h-4 w-4 mr-1" /> Novo contato</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
            <Tabs value={type} onValueChange={(v) => setType(v as "person" | "company")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="person"><UserIcon className="h-4 w-4 mr-1" /> Pessoa física</TabsTrigger>
                <TabsTrigger value="company"><Building2 className="h-4 w-4 mr-1" /> Pessoa jurídica</TabsTrigger>
              </TabsList>
              <form onSubmit={submit}>
                <TabsContent value="person" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Nome *</Label><Input name="name" required /></div>
                    <div><Label>Email</Label><Input name="email" type="email" /></div>
                    <div><Label>Telefone</Label><Input name="phone" /></div>
                    <div><Label>WhatsApp</Label><Input name="whatsapp" /></div>
                    <div><Label>CPF</Label><Input name="document" /></div>
                    <div><Label>Nascimento</Label><Input name="birthdate" type="date" /></div>
                    <div><Label>Empresa</Label><Input name="company_name" /></div>
                    <div><Label>Cargo</Label><Input name="job_title" /></div>
                  </div>
                  <div><Label>Endereço</Label><Input name="address" /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Cidade</Label><Input name="city" /></div>
                    <div><Label>Estado</Label><Input name="state" /></div>
                    <div><Label>CEP</Label><Input name="zipcode" /></div>
                  </div>
                  <div><Label>Tags (separadas por vírgula)</Label><Input name="tags" placeholder="vip, lead-quente" /></div>
                  <div><Label>Observações</Label><Input name="notes" /></div>
                </TabsContent>
                <TabsContent value="company" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Razão social *</Label><Input name="name" required /></div>
                    <div><Label>Nome fantasia</Label><Input name="company_name" /></div>
                    <div><Label>CNPJ</Label><Input name="document" /></div>
                    <div><Label>Responsável</Label><Input name="responsible" /></div>
                    <div><Label>Email</Label><Input name="email" type="email" /></div>
                    <div><Label>Telefone</Label><Input name="phone" /></div>
                    <div><Label>WhatsApp</Label><Input name="whatsapp" /></div>
                    <div><Label>Segmento</Label><Input name="segment" /></div>
                    <div><Label>Funcionários</Label><Input name="employees" /></div>
                    <div><Label>Faturamento</Label><Input name="revenue" /></div>
                  </div>
                  <div><Label>Tags</Label><Input name="tags" /></div>
                </TabsContent>
                <Button type="submit" className="w-full mt-4 gradient-brand text-primary-foreground border-0">Salvar contato</Button>
              </form>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

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
              <th className="text-left px-4 py-3 hidden lg:table-cell">Empresa / Segmento</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.data?.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Nenhum contato ainda. Crie o primeiro!</td></tr>
            )}
            {contacts.data?.map((c) => (
              <tr key={c.id} className="hover:bg-surface/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className={c.type === "company" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"}>
                        {c.type === "company" ? <Building2 className="h-4 w-4" /> : c.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.type === "company" ? "Empresa" : "Pessoa"}</div>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
