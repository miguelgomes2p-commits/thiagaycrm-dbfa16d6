import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  createVehicleFiscalDraft,
  validateVehicleFiscalOperation,
} from "@/lib/fiscal-vehicle.functions";
import { BUYER_PRESENCE_OPTIONS, TAXPAYER_INDICATOR_LABEL } from "@/lib/fiscal/operations";
import { parseMoney } from "@/lib/financial";
import type { Vehicle } from "@/lib/vehicles";

type Counterparty = {
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
  taxpayer_indicator: "contributor" | "exempt" | "non_contributor";
};

/** Pendências que dependem exclusivamente da configuração contábil do perfil. */
const ACCOUNTING_FIELD_LABEL: Record<string, string> = {
  icms: "CST ICMS",
  pis: "CST PIS",
  cofins: "CST COFINS",
  cfop: "CFOP",
  ncm: "NCM",
  ibs: "IBS",
  cbs: "CBS",
  fiscal_profile: "Perfil fiscal da operação",
};

const EMPTY: Counterparty = {
  person_type: "PF",
  name: "",
  cpf: "",
  cnpj: "",
  ie: "",
  email: "",
  phone: "",
  zipcode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  ibge: "",
  uf: "",
  taxpayer_indicator: "non_contributor",
};

export function VehicleFiscalDraftDialog({
  open,
  onOpenChange,
  vehicle,
  transactionType,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicle: Vehicle;
  transactionType: "purchase" | "sale";
}) {
  const [cp, setCp] = useState<Counterparty>(EMPTY);
  const [amount, setAmount] = useState("");
  const [presence, setPresence] = useState("1");
  const set = (p: Partial<Counterparty>) => setCp((c) => ({ ...c, ...p }));

  const validateFn = useServerFn(validateVehicleFiscalOperation);
  const createFn = useServerFn(createVehicleFiscalDraft);

  useEffect(() => {
    if (!open) return;
    setCp(EMPTY);
    setAmount(transactionType === "sale" && vehicle.price != null ? String(vehicle.price) : "");
  }, [open, transactionType, vehicle.price]);

  const payload = () => ({
    workspaceId: vehicle.workspace_id,
    vehicleId: vehicle.id,
    transactionType,
    amount: parseMoney(amount) ?? 0,
    counterparty: {
      person_type: cp.person_type,
      name: cp.name,
      ...(cp.person_type === "PF" ? { cpf: cp.cpf } : { cnpj: cp.cnpj, ie: cp.ie }),
      email: cp.email,
      phone: cp.phone,
      zipcode: cp.zipcode,
      street: cp.street,
      number: cp.number,
      complement: cp.complement,
      district: cp.district,
      city: cp.city,
      ibge: cp.ibge,
      uf: cp.uf.toUpperCase(),
      taxpayer_indicator: cp.taxpayer_indicator,
    },
    buyerPresence: Number(presence),
  });

  const validationQ = useQuery({
    enabled: open && (parseMoney(amount) ?? 0) > 0,
    queryKey: ["vehicle-fiscal-validate", vehicle.id, transactionType, amount, JSON.stringify(cp)],
    queryFn: () =>
      validateFn({ data: payload() }) as Promise<{
        issues: Array<{ field: string; message: string }>;
        operation_key?: string | null;
      }>,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: payload() }) as Promise<{ documentId: string }>,
    onSuccess: () => {
      toast.success("Rascunho fiscal criado. Revise e emita quando estiver pronto.");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issues = validationQ.data?.issues ?? [];
  const operationKey = validationQ.data?.operation_key ?? null;
  const accountingIssues = issues.filter((i) => ACCOUNTING_FIELD_LABEL[i.field]);
  const otherIssues = issues.filter((i) => !ACCOUNTING_FIELD_LABEL[i.field]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {transactionType === "purchase"
              ? "Rascunho de NF-e de entrada"
              : "Rascunho de NF-e de venda"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Tipo de pessoa</Label>
              <Select
                value={cp.person_type}
                onValueChange={(v) => set({ person_type: v as "PF" | "PJ" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa física</SelectItem>
                  <SelectItem value="PJ">Pessoa jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>{transactionType === "purchase" ? "Vendedor" : "Comprador"}</Label>
              <Input value={cp.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {cp.person_type === "PF" ? (
              <div>
                <Label>CPF</Label>
                <Input value={cp.cpf} onChange={(e) => set({ cpf: e.target.value })} />
              </div>
            ) : (
              <>
                <div>
                  <Label>CNPJ</Label>
                  <Input value={cp.cnpj} onChange={(e) => set({ cnpj: e.target.value })} />
                </div>
                <div>
                  <Label>Inscrição Estadual</Label>
                  <Input value={cp.ie} onChange={(e) => set({ ie: e.target.value })} />
                </div>
              </>
            )}
            <div>
              <Label>Indicador de IE</Label>
              <Select
                value={cp.taxpayer_indicator}
                onValueChange={(v) =>
                  set({ taxpayer_indicator: v as Counterparty["taxpayer_indicator"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TAXPAYER_INDICATOR_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>CEP</Label>
              <Input value={cp.zipcode} onChange={(e) => set({ zipcode: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Logradouro</Label>
              <Input value={cp.street} onChange={(e) => set({ street: e.target.value })} />
            </div>
            <div>
              <Label>Número</Label>
              <Input value={cp.number} onChange={(e) => set({ number: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Bairro</Label>
              <Input value={cp.district} onChange={(e) => set({ district: e.target.value })} />
            </div>
            <div>
              <Label>Município</Label>
              <Input value={cp.city} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div>
              <Label>Código IBGE</Label>
              <Input value={cp.ibge} onChange={(e) => set({ ibge: e.target.value })} />
            </div>
            <div>
              <Label>UF</Label>
              <Input maxLength={2} value={cp.uf} onChange={(e) => set({ uf: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>E-mail</Label>
              <Input value={cp.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={cp.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div>
              <Label>Valor da operação (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Presença do comprador</Label>
              <Select value={presence} onValueChange={setPresence}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUYER_PRESENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-1">
              <p className="text-[11px] font-semibold uppercase text-amber-700">Pendências</p>
              <ul className="list-disc pl-4 text-xs text-amber-800">
                {issues.map((i, idx) => (
                  <li key={`${i.field}-${idx}`}>{i.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="cursor-pointer"
            disabled={create.isPending || issues.length > 0 || !(parseMoney(amount) ?? 0)}
            onClick={() => create.mutate()}
          >
            {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Criar rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
