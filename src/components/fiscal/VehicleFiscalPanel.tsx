/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileDown, FileText, Loader2, Upload } from "lucide-react";
import {
  getVehicleFiscalStatus,
  issueVehicleFiscalDocument,
  importSupplierNfe,
} from "@/lib/fiscal-vehicle.functions";
import { getFiscalDocumentLinks } from "@/lib/fiscal.functions";
import { FISCAL_STATUS_LABEL } from "@/lib/fiscal/types";
import { FISCAL_DIRECTION_LABEL, operationLabel } from "@/lib/fiscal/operations";
import { VehicleFiscalDraftDialog } from "@/components/fiscal/VehicleFiscalDraftDialog";
import type { Vehicle } from "@/lib/vehicles";

type Doc = {
  id: string;
  direction: string;
  source: string;
  self_issued: boolean;
  operation_key: string | null;
  status: string;
  environment: string;
  number: string | null;
  series: string | null;
  access_key: string | null;
  total_amount: number | string | null;
  created_at: string;
  rejection_message: string | null;
};

function fmt(v: number | string | null) {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function VehicleFiscalPanel({ vehicle }: { vehicle: Vehicle }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getVehicleFiscalStatus);
  const issueFn = useServerFn(issueVehicleFiscalDocument);
  const importFn = useServerFn(importSupplierNfe);
  const linksFn = useServerFn(getFiscalDocumentLinks);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<"purchase" | "sale" | null>(null);

  const key = ["vehicle-fiscal-status", vehicle.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      statusFn({
        data: { workspaceId: vehicle.workspace_id, vehicleId: vehicle.id },
      }) as Promise<any>,
  });

  const issue = useMutation({
    mutationFn: (documentId: string) =>
      issueFn({ data: { workspaceId: vehicle.workspace_id, documentId } }) as Promise<any>,
    onSuccess: (r) => {
      toast.success(
        r?.status === "authorized" ? "NF-e autorizada." : "Emissão enviada. Acompanhe o status.",
      );
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importXml = useMutation({
    mutationFn: async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      buf.forEach((b) => (bin += String.fromCharCode(b)));
      return importFn({
        data: {
          workspaceId: vehicle.workspace_id,
          vehicleId: vehicle.id,
          filename: file.name,
          xmlBase64: btoa(bin),
        },
      }) as Promise<any>;
    },
    onSuccess: (r) => {
      toast.success(
        r?.duplicated ? "XML já importado anteriormente." : "XML do fornecedor importado.",
      );
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(documentId: string, kind: "xml" | "danfe") {
    try {
      const links = (await linksFn({
        data: { workspaceId: vehicle.workspace_id, documentId },
      })) as { xmlUrl?: string | null; danfeUrl?: string | null };
      const url = kind === "xml" ? links.xmlUrl : links.danfeUrl;
      if (!url) {
        toast.error("Arquivo ainda não disponível.");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (q.isLoading) {
    return (
      <div className="pt-2 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando situação fiscal...
      </div>
    );
  }
  if (q.isError) {
    return (
      <p className="pt-2 border-t border-border text-xs text-muted-foreground">
        Situação fiscal indisponível para o seu perfil.
      </p>
    );
  }

  const data = q.data as any;
  const docs: Doc[] = data?.documents ?? [];
  const entry = data?.entry;
  const sale = data?.sale;

  return (
    <div className="pt-2 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Documentação fiscal
        </p>
        <Badge variant="secondary" className="text-[10px]">
          {data?.environment === "production" ? "Produção" : "Homologação"}
        </Badge>
      </div>

      {data?.divergence && (
        <p className="text-xs text-amber-600">
          ⚠ Divergência: NF-e {fmt(data.divergence.fiscal)} × financeiro{" "}
          {fmt(data.divergence.financial)}.
        </p>
      )}

      <div className="grid gap-2 text-xs">
        <OperationRow
          title="Entrada"
          ctx={entry}
          onDraft={() => setDraft("purchase")}
          onImport={() => fileRef.current?.click()}
          importing={importXml.isPending}
        />
        <OperationRow title="Saída" ctx={sale} onDraft={() => setDraft("sale")} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) importXml.mutate(f);
        }}
      />

      {docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum documento fiscal para este veículo.</p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">
                  {FISCAL_DIRECTION_LABEL[d.direction as "entry" | "exit"] ?? d.direction}
                  {d.number
                    ? ` • NF-e ${d.number}${d.series ? `/${d.series}` : ""}`
                    : " • sem número"}
                </span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {FISCAL_STATUS_LABEL[d.status as keyof typeof FISCAL_STATUS_LABEL] ?? d.status}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {operationLabel(d.operation_key)} • {fmt(d.total_amount)}
                {d.source === "imported" ? " • recebida do fornecedor" : ""}
              </p>
              {d.rejection_message && (
                <p className="text-[11px] text-destructive">{d.rejection_message}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {d.status === "draft" && d.source !== "imported" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] cursor-pointer"
                    disabled={issue.isPending}
                    onClick={() => issue.mutate(d.id)}
                  >
                    {issue.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3 mr-1" />
                    )}
                    Emitir
                  </Button>
                )}
                {(d.status === "rejected" || d.status === "error") && d.source !== "imported" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] cursor-pointer"
                    disabled={issue.isPending}
                    onClick={() => issue.mutate(d.id)}
                  >
                    {issue.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Reenviar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] cursor-pointer"
                  onClick={() => download(d.id, "xml")}
                >
                  <Download className="h-3 w-3 mr-1" /> XML
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] cursor-pointer"
                  onClick={() => download(d.id, "danfe")}
                >
                  <FileDown className="h-3 w-3 mr-1" /> DANFE
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <VehicleFiscalDraftDialog
          open
          transactionType={draft}
          vehicle={vehicle}
          onOpenChange={(o) => {
            if (!o) setDraft(null);
            qc.invalidateQueries({ queryKey: key });
          }}
        />
      )}
    </div>
  );
}

function OperationRow({
  title,
  ctx,
  onDraft,
  onImport,
  importing,
}: {
  title: string;
  ctx: any;
  onDraft: () => void;
  onImport?: () => void;
  importing?: boolean;
}) {
  if (!ctx) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {operationLabel(ctx.operation_key)}
          {ctx.profile_configured ? ` • perfil: ${ctx.profile_name}` : " • perfil não configurado"}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {ctx.supports_self_issue ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] cursor-pointer"
            onClick={onDraft}
          >
            <FileText className="h-3 w-3 mr-1" /> Gerar rascunho
          </Button>
        ) : onImport ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] cursor-pointer"
            disabled={importing}
            onClick={onImport}
          >
            {importing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Upload className="h-3 w-3 mr-1" />
            )}
            Importar XML
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">Emissão por terceiro</span>
        )}
      </div>
    </div>
  );
}
