import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Rocket } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "empresa";
}

function Onboarding() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const slug = slugify(name) + "-" + Math.random().toString(36).slice(2, 6);
    const { error } = await supabase.rpc("create_workspace_with_defaults", { _name: name.trim(), _slug: slug });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Empresa criada!");
    qc.invalidateQueries();
    navigate({ to: "/app" });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md card-elevated p-8 animate-fade-in-up">
        <div className="h-12 w-12 rounded-xl gradient-brand grid place-items-center mb-4">
          <Rocket className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Crie sua empresa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vamos configurar seu workspace com um pipeline padrão pronto para começar.
        </p>
        <form onSubmit={handleCreate} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="name">Nome da empresa</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lupus Assessoria" required autoFocus />
          </div>
          <Button type="submit" disabled={loading || !name.trim()} className="w-full gradient-brand text-primary-foreground border-0 h-11">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar workspace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
