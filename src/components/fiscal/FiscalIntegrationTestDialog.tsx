// Diagnóstico técnico da integração CRM ↔ Focus NFe.
// NÃO emite NF-e, não cria documento fiscal e não altera nenhuma configuração.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { testFiscalIntegration, type FiscalIntegrationTest } from "@/lib/fiscal.functions";

const LS_KEY = "fiscal-integration-test";

type StepStatus = "success" | "warning" | "error" | "skipped" | "pending";

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "pending") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  return <span className="h-4 w-4 text-center text-xs text-muted-foreground">–</span>;
}

function Step({
  label,
  status,
  message,
  detail,
}: {
  label: string;
  status: StepStatus;
  message?: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="mt-0.5"><StatusIcon status={status} /></div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {status === "pending" ? "Verificando..." : (message ?? "—")}
        </p>
        {detail && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

export function FiscalIntegrationTestButton({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<{ at: string; ok: boolean; ran: boolean } | null>(null);
  const testFn = useServerFn(testFiscalIntegration);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${LS_KEY}:${workspaceId}`);
      if (raw) setLast(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  const m = useMutation({
    mutationFn: () => testFn({ data: { workspaceId } }) as Promise<FiscalIntegrationTest>,
    onSuccess: (r) => {
      const entry = { at: r.finishedAt, ok: r.ok, ran: r.ran };
      setLast(entry);
      try {
        localStorage.setItem(`${LS_KEY}:${workspaceId}`, JSON.stringify(entry));
      } catch {
        /* ignore */
      }
    },
  });

  const run = () => {
    setOpen(true);
    m.mutate();
  };

  const r = m.data;
  const pending = m.isPending;
  const st = (s?: string): StepStatus => (pending ? "pending" : ((s as StepStatus) ?? "pending"));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" className="cursor-pointer h-8 text-xs" onClick={run}>
        <FlaskConical className="h-3.5 w-3.5 mr-1.5" /> Testar integração NF-e
      </Button>
      {last && (
        <span className="text-xs text-muted-foreground">
          Último teste: {new Date(last.at).toLocaleString("pt-BR")} •{" "}
          {!last.ran ? "⚠️ Não executado" : last.ok ? "✅ Integração operacional" : "⚠️ Integração com pendências"}
        </span>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">🧪 Teste de integração NF-e</DialogTitle>
          </DialogHeader>

          <div className="divide-y divide-border">
            <Step
              label="Ambiente"
              status={st(r?.environment.status)}
              message={r?.environment.message}
              detail={r?.environment.detail}
            />
            <Step label="Token de homologação" status={st(r?.credentials.status)} message={r?.credentials.message} />
            <Step
              label="Comunicação Focus NFe"
              status={st(r?.provider_connection.status)}
              message={r?.provider_connection.message}
              detail={r?.provider_connection.detail}
            />
            <Step
              label="Empresa emitente"
              status={st(r?.issuer.status)}
              message={
                r?.issuer.missing_fields?.length
                  ? `Campos cadastrais ausentes: ${r.issuer.missing_fields.join(", ")}`
                  : r?.issuer.message
              }
            />
            <Step
              label="Empresa na Focus NFe"
              status={st(r?.company.status)}
              message={r?.company.message}
              detail={r?.company.detail}
            />
            <Step
              label="Certificado digital"
              status={st(r?.certificate.status)}
              message={r?.certificate.message}
              detail={
                r?.certificate.expiresAt
                  ? `Tipo A1 • validade ${new Date(r.certificate.expiresAt).toLocaleDateString("pt-BR")}`
                  : undefined
              }
            />
          </div>

          {m.isError && (
            <p className="text-xs text-destructive">{(m.error as Error).message}</p>
          )}

          {r && (
            <div className="space-y-3 border-t border-border pt-3">
              {r.ok ? (
                <div className="rounded-md bg-emerald-50 p-3">
                  <p className="text-sm font-medium text-emerald-700">✅ Integração técnica operacional</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    O CRM está conseguindo se comunicar corretamente com a Focus NFe em homologação. Para
                    realizar uma emissão completa de NF-e ainda será necessário que o perfil fiscal possua
                    todos os dados tributários obrigatórios.
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800">
                    {r.ran ? "⚠️ Integração com pendências técnicas" : "⚠️ Teste não executado"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.environment.status === "warning"
                      ? "O ambiente atual é Produção. Este teste técnico deve ser executado em homologação — nada foi alterado."
                      : "Revise os itens marcados acima. Nenhuma configuração foi alterada pelo teste."}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Configuração para emissão
                </p>
                {r.tax_profile.missing_fields.length > 0 || r.tax_profile.status !== "success" ? (
                  <div className="mt-1 text-xs">
                    <p className="text-amber-700">🟡 {r.tax_profile.message}</p>
                    <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                      {r.tax_profile.missing_fields.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                    <p className="mt-1 text-muted-foreground">
                      Essas informações não impedem o teste da integração, mas serão necessárias para emitir
                      uma NF-e.
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-emerald-700">✅ {r.tax_profile.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" className="cursor-pointer" onClick={() => setOpen(false)}>Fechar</Button>
            <Button className="cursor-pointer" disabled={pending} onClick={() => m.mutate()}>
              {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Testar novamente
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
