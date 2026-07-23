import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, MessageSquare, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  listStageAutomations,
  upsertStageAutomation,
  deleteStageAutomation,
} from "@/lib/automations.functions";

type Automation = {
  id: string;
  name: string;
  action_type: string;
  message: string | null;
  delay_seconds: number;
  active: boolean;
};

const VARIABLES = [
  { key: "{{contact.name}}", desc: "Nome do contato salvo no CRM", example: "João Silva" },
  { key: "{{contact.phone}}", desc: "Telefone no formato internacional", example: "5511987654321" },
  { key: "{{lead.title}}", desc: "Título do card no pipeline", example: "Honda Civic 2020 — João" },
  { key: "{{lead.value}}", desc: "Valor do lead formatado em BRL", example: "R$ 85.000,00" },
];

export function StageAutomationDialog({
  open,
  onOpenChange,
  stageId,
  stageName,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stageId: string;
  stageName: string;
  workspaceId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStageAutomations);
  const upsertFn = useServerFn(upsertStageAutomation);
  const delFn = useServerFn(deleteStageAutomation);

  const [editing, setEditing] = useState<Partial<Automation> | null>(null);

  const q = useQuery({
    enabled: open,
    queryKey: ["stage-automations", stageId],
    queryFn: () => listFn({ data: { stageId } }),
  });

  const upsertM = useMutation({
    mutationFn: (input: Partial<Automation>) =>
      upsertFn({
        data: {
          id: input.id ?? undefined,
          workspaceId,
          stageId,
          name: input.name || "Automação",
          actionType: "send_whatsapp",
          message: input.message || "",
          delaySeconds: input.delay_seconds ?? 0,
          active: input.active ?? true,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stage-automations", stageId] });
      setEditing(null);
      toast.success("Automação salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stage-automations", stageId] });
      toast.success("Automação removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (q.data ?? []) as Automation[];

  function insertVar(v: string) {
    setEditing((prev) => ({ ...prev, message: `${prev?.message ?? ""}${v}` }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Gatilhos — {stageName}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          As automações rodam automaticamente quando um lead entra nesta etapa.
        </p>

        {!editing && (
          <div className="space-y-2">
            {q.isLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto my-4" />}
            {!q.isLoading && items.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6 border border-dashed border-border rounded-lg">
                Nenhum gatilho configurado
              </div>
            )}
            {items.map((a) => (
              <div key={a.id} className="p-3 rounded-lg border border-border bg-surface/40 flex items-start gap-3">
                <div className="mt-0.5">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{a.name}</span>
                    {!a.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">inativa</span>}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.message}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Editar</Button>
                  <Button size="icon" variant="ghost" className="text-destructive"
                    onClick={() => delM.mutate(a.id)} disabled={delM.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setEditing({ name: "", message: "", delay_seconds: 0, active: true })}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova automação
            </Button>
          </div>
        )}

        {editing && (
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={editing.name ?? ""} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Pedir avaliação Google" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Mensagem WhatsApp</Label>
              <Textarea rows={5} value={editing.message ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p, message: e.target.value }))}
                placeholder="Olá {{contact.name}}, obrigado pela confiança..." />
              <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="text-[11px] font-medium text-muted-foreground mb-1.5">
                  Variáveis disponíveis — clique para inserir
                </div>
                <div className="space-y-1">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-primary/5 transition-colors group"
                    >
                      <code className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                        {v.key}
                      </code>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-foreground truncate">{v.desc}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          ex: <span className="font-medium">{v.example}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm">Ativa</Label>
                <p className="text-xs text-muted-foreground">Dispara ao mover lead para "{stageName}"</p>
              </div>
              <Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing((p) => ({ ...p, active: v }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={() => upsertM.mutate(editing)} disabled={upsertM.isPending || !editing.message?.trim()}
                className="gradient-brand text-primary-foreground border-0">
                {upsertM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
