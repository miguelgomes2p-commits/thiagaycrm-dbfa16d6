import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspaces } from "@/hooks/useWorkspace";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/app/tasks")({
  component: TasksPage,
});

function TasksPage() {
  const { data: workspaces } = useMyWorkspaces();
  const ws = workspaces?.[0];
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const tasksQ = useQuery({
    enabled: !!ws?.id,
    queryKey: ["tasks", ws?.id],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("workspace_id", ws!.id).order("done").order("due_at", { nullsFirst: false });
      return data ?? [];
    },
  });

  async function toggleDone(id: string, done: boolean) {
    await supabase.from("tasks").update({ done: !done }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function createTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ws) return;
    const fd = new FormData(e.currentTarget);
    const { data: u } = await supabase.auth.getSession();
    const { error } = await supabase.from("tasks").insert({
      workspace_id: ws.id,
      title: String(fd.get("title")),
      description: String(fd.get("description") || "") || null,
      due_at: fd.get("due_at") ? String(fd.get("due_at")) : null,
      created_by: u.session?.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    setOpen(false);
    toast.success("Tarefa criada");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-sm text-muted-foreground">Suas tarefas e follow-ups.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-brand text-primary-foreground border-0"><Plus className="h-4 w-4 mr-1" /> Nova tarefa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
            <form onSubmit={createTask} className="space-y-3">
              <div><Label>Título *</Label><Input name="title" required /></div>
              <div><Label>Descrição</Label><Input name="description" /></div>
              <div><Label>Prazo</Label><Input name="due_at" type="datetime-local" /></div>
              <Button type="submit" className="w-full gradient-brand text-primary-foreground border-0">Criar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="card-elevated divide-y divide-border">
        {tasksQ.data?.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <CheckSquare className="h-10 w-10 mx-auto opacity-30 mb-2" />
            Nenhuma tarefa. Crie a primeira!
          </div>
        )}
        {tasksQ.data?.map((t) => (
          <div key={t.id} className="p-4 flex items-start gap-3 hover:bg-surface/30">
            <Checkbox checked={t.done} onCheckedChange={() => toggleDone(t.id, t.done)} className="mt-1" />
            <div className="flex-1">
              <div className={cn("font-medium", t.done && "line-through text-muted-foreground")}>{t.title}</div>
              {t.description && <div className="text-sm text-muted-foreground">{t.description}</div>}
              {t.due_at && (
                <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {format(new Date(t.due_at), "dd/MM/yyyy HH:mm")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
