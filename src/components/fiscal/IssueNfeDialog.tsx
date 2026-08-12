import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listFiscalProfiles,
  validateFiscalEmission,
  issueFiscalNfe,
  syncFiscalDocument,
} from "@/lib/fiscal.functions";
import type { FiscalValidationIssue } from "@/lib/fiscal/types";
import { formatBRL, vehicleTitle, type Vehicle } from "@/lib/vehicles";

type Recipient = {
  person_type: "PF" | "PJ";
  name: string;
  cpf: string;
  cnpj: string;
  ie: string;
  email: string;
  phone: string;
  zipcode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  ibge: string;
  uf: string;
};

const EMPTY: Recipient = {
  person_type: "PF", name: "", cpf: "", cnpj: "", ie: "", email: "", phone: "",
  zipcode: "", street: "", number: "", complement: "", district: "", city: "", ibge: "", uf: "",
};

export function IssueNfeDialog({
  open, onOpenChange, vehicle, workspaceId,
}: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: Vehicle; workspaceId: string }) {
  const qc = useQueryClient();
  const profilesFn = useServerFn(listFiscalProfiles);
  const validateFn = useServerFn(validateFiscalEmission);
  const issueFn = useServerFn(issueFiscalNfe);
  const syncFn = useServerFn(syncFiscalDocument);

  const [recipient, setRecipient] = useState<Recipient>(EMPTY);
  const [profileId, setProfileId] = useState("");
  const [amount, setAmount] = useState<string>(String(vehicle.price ?? ""));
  const [step, setStep] = useState<"form" | "review">("form");
  const [issues, setIssues] = useState<FiscalValidationIssue[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);

  const profilesQ = useQuery({
    enabled: open,
    queryKey: ["fiscal-profiles", workspaceId],
    queryFn: () => profilesFn({ data: { workspaceId } }),
  });

  const leadId = vehicle.sold_to_lead_id ?? vehicle.reserved_for_lead_id ?? null;
  const buyerQ = useQuery({
    enabled: open && !!leadId,
    queryKey: ["fiscal-buyer", leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, contact_id, contacts:contact_id(name, document, email, phone, address, city, state, zipcode, type)")
        .eq("id", leadId!)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!open) return;
    const c = (buyerQ.data as any)?.contacts;
    if (!c) return;
    const digits = String(c.document ?? "").replace(/\D+/g, "");
    setRecipient((r) => ({
      ...r,
      person_type: digits.length === 14 ? "PJ" : "PF",
      name: r.name || c.name || "",
      cpf: r.cpf || (digits.length === 11 ? digits : ""),
      cnpj: r.cnpj || (digits.length === 14 ? digits : ""),
      email: r.email || c.email || "",
      phone: r.phone || c.phone || "",
      street: r.street || c.address || "",
      city: r.city || c.city || "",
      uf: r.uf || (c.state ?? "").slice(0, 2),
      zipcode: r.zipcode || c.zipcode || "",
    }));
  }, [buyerQ.data, open]);

  useEffect(() => {
    const list = profilesQ.data as any[] | undefined;
    if (!profileId && list?.length) {
      const def = list.find((p) => p.is_default) ?? list[0];
      setProfileId(def.id);
    }
  }, [profilesQ.data, profileId]);

  const activeProfile = useMemo(
    () => ((profilesQ.data as any[]) ?? []).find((p) => p.id === profileId),
    [profilesQ.data, profileId],
  );

  const payload = () => ({
    workspaceId,
    vehicleId: vehicle.id,
    fiscalProfileId: profileId,
    amount: Number(amount || 0),
    leadId,
    contactId: (buyerQ.data as any)?.contact_id ?? null,
    recipient: {
      ...recipient,
      final_consumer: true,
      taxpayer: recipient.person_type === "PJ" && !!recipient.ie,
    },
  });

  const validateM = useMutation({
    mutationFn: () => validateFn({ data: payload() as any }),
    onSuccess: (res: any) => {
      setIssues(res.issues ?? []);
      if (res.ok) setStep("review");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issueM = useMutation({
    mutationFn: () => issueFn({ data: payload() as any }),
    onSuccess: (res: any) => {
      if (!res.ok) { setIssues(res.issues ?? []); setStep("form"); return; }
      setDocumentId(res.documentId);
      setDocStatus(res.status);
      qc.invalidateQueries({ queryKey: ["fiscal-documents"] });
      if (res.status === "authorized") toast.success("NF-e autorizada!");
      else if (res.status === "rejected") toast.error("NF-e rejeitada pela SEFAZ.");
      else toast.info("NF-e enviada. Aguardando retorno da SEFAZ.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncM = useMutation({
    mutationFn: () => syncFn({ data: { workspaceId, documentId: documentId! } }),
    onSuccess: (res: any) => {
      setDocStatus(res.status);
      qc.invalidateQueries({ queryKey: ["fiscal-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = validateM.isPending || issueM.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep("form"); setIssues([]); setDocumentId(null); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Emitir NF-e — {vehicleTitle(vehicle)}
          </DialogTitle>
        </DialogHeader>

        {documentId ? (
          <div className="space-y-3 text-sm">
            <p>Status atual: <Badge variant="secondary">{docStatus}</Badge></p>
            <p className="text-muted-foreground text-xs">
              O provedor fiscal atualiza automaticamente via webhook. Você também pode consultar agora.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="cursor-pointer" disabled={syncM.isPending} onClick={() => syncM.mutate()}>
                {syncM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Consultar status
              </Button>
              <Button size="sm" className="cursor-pointer" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        ) : step === "review" ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border p-3 space-y-1">
              <p className="font-medium">Comprador</p>
              <p className="text-muted-foreground text-xs">
                {recipient.name} • {recipient.person_type === "PJ" ? recipient.cnpj : recipient.cpf}
              </p>
              <p className="text-muted-foreground text-xs">
                {recipient.street}, {recipient.number} — {recipient.district}, {recipient.city}/{recipient.uf}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-1">
              <p className="font-medium">Veículo</p>
              <p className="text-muted-foreground text-xs">{vehicleTitle(vehicle)}</p>
              <p className="text-muted-foreground text-xs">
                Operação: {activeProfile?.name} • CFOP {activeProfile?.cfop} • NCM {activeProfile?.ncm}
              </p>
              <p className="font-semibold">{formatBRL(Number(amount || 0))}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="cursor-pointer" onClick={() => setStep("form")}>Voltar</Button>
              <Button className="cursor-pointer" disabled={busy} onClick={() => issueM.mutate()}>
                {issueM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Emitir NF-e
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Não foi possível emitir a NF-e. Corrija:
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                  {issues.map((i, idx) => <li key={idx}>{i.message}</li>)}
                </ul>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Perfil fiscal">
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {((profilesQ.data as any[]) ?? []).filter((p) => p.active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Valor total (R$)">
                <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
              </Field>
              <Field label="Tipo de pessoa">
                <Select value={recipient.person_type} onValueChange={(v) => setRecipient({ ...recipient, person_type: v as "PF" | "PJ" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={recipient.person_type === "PJ" ? "Razão social" : "Nome completo"}>
                <Input value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} />
              </Field>
              {recipient.person_type === "PJ" ? (
                <>
                  <Field label="CNPJ"><Input value={recipient.cnpj} onChange={(e) => setRecipient({ ...recipient, cnpj: e.target.value })} /></Field>
                  <Field label="Inscrição Estadual"><Input value={recipient.ie} placeholder="ISENTO" onChange={(e) => setRecipient({ ...recipient, ie: e.target.value })} /></Field>
                </>
              ) : (
                <Field label="CPF"><Input value={recipient.cpf} onChange={(e) => setRecipient({ ...recipient, cpf: e.target.value })} /></Field>
              )}
              <Field label="CEP"><Input value={recipient.zipcode} onChange={(e) => setRecipient({ ...recipient, zipcode: e.target.value })} /></Field>
              <Field label="Logradouro"><Input value={recipient.street} onChange={(e) => setRecipient({ ...recipient, street: e.target.value })} /></Field>
              <Field label="Número"><Input value={recipient.number} onChange={(e) => setRecipient({ ...recipient, number: e.target.value })} /></Field>
              <Field label="Complemento"><Input value={recipient.complement} onChange={(e) => setRecipient({ ...recipient, complement: e.target.value })} /></Field>
              <Field label="Bairro"><Input value={recipient.district} onChange={(e) => setRecipient({ ...recipient, district: e.target.value })} /></Field>
              <Field label="Município"><Input value={recipient.city} onChange={(e) => setRecipient({ ...recipient, city: e.target.value })} /></Field>
              <Field label="Código IBGE do município"><Input value={recipient.ibge} onChange={(e) => setRecipient({ ...recipient, ibge: e.target.value })} /></Field>
              <Field label="UF"><Input maxLength={2} value={recipient.uf} onChange={(e) => setRecipient({ ...recipient, uf: e.target.value.toUpperCase() })} /></Field>
              <Field label="E-mail"><Input value={recipient.email} onChange={(e) => setRecipient({ ...recipient, email: e.target.value })} /></Field>
              <Field label="Telefone"><Input value={recipient.phone} onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })} /></Field>
            </div>

            <div className="flex justify-end">
              <Button className="cursor-pointer" disabled={busy} onClick={() => validateM.mutate()}>
                {validateM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Revisar NF-e
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
