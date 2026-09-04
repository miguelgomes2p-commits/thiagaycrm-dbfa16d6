/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFiscalDocumentDiagnostics } from "@/lib/fiscal-diagnostics.functions";

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{title}</p>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function FiscalDocumentLogDialog({
  workspaceId,
  documentId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  documentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fn = useServerFn(getFiscalDocumentDiagnostics);
  const q = useQuery({
    queryKey: ["fiscal-doc-log", documentId],
    enabled: open,
    queryFn: () => fn({ data: { workspaceId, documentId } }) as Promise<any>,
  });

  const d = q.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log técnico da NF-e</DialogTitle>
          <DialogDescription>
            Consulta somente leitura ao provedor. Nada é emitido ou alterado; tokens e credenciais
            não são exibidos.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
          </div>
        )}
        {q.error && (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        )}

        {d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <p>
                <span className="text-muted-foreground">Referência (ref): </span>
                {d.ref ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Ambiente: </span>
                {d.environment}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                {d.status}
              </p>
              <p>
                <span className="text-muted-foreground">HTTP provedor: </span>
                {d.provider?.httpStatus ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Código do erro: </span>
                {d.provider?.errorCode ?? d.rejectionCode ?? "—"}
              </p>
              <p className="col-span-2">
                <span className="text-muted-foreground">Natureza da operação: </span>
                {d.payload?.operacao?.profile?.natureza_operacao ?? "—"}
              </p>
              <p className="col-span-2">
                <span className="text-muted-foreground">Mensagem: </span>
                {d.provider?.errorMessage ?? d.rejectionMessage ?? "—"}
              </p>
            </div>

            {d.provider?.error && <Block title="Falha na consulta" value={d.provider.error} />}
            {d.payload?.tributacao?.icms_group && (
              <Block
                title="Grupo ICMS calculado"
                value={[
                  "ICMS",
                  `CST: ${d.payload.tributacao.icms_group.cst}`,
                  `Modalidade BC: ${d.payload.tributacao.icms_group.modalidade_bc} — ${d.payload.tributacao.icms_group.modalidade_bc_label}`,
                  `Valor operação: R$ ${Number(d.payload.tributacao.icms_group.valor_operacao).toFixed(2)}`,
                  `Redução BC: ${d.payload.tributacao.icms_group.reducao_bc}%`,
                  `Base ICMS: R$ ${Number(d.payload.tributacao.icms_group.base_icms).toFixed(2)}`,
                  `Alíquota: ${d.payload.tributacao.icms_group.aliquota}%`,
                  `Valor ICMS: R$ ${Number(d.payload.tributacao.icms_group.valor_icms).toFixed(2)}`,
                ].join("\n")}
              />
            )}

            <Block title="Detalhamento retornado pelo provedor" value={d.provider?.raw ?? "—"} />
            <Block title="Tentativas registradas" value={d.attempts} />
            <Block title="Payload enviado (sem credenciais)" value={d.payload} />

            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer"
              onClick={() => {
                void navigator.clipboard.writeText(JSON.stringify(d, null, 2));
                toast.success("Log copiado");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar log completo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
