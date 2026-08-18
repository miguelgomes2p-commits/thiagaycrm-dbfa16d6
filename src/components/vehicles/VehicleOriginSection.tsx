import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACQUISITION_SOURCE_OPTIONS,
  OWNERSHIP_TYPE_OPTIONS,
  type AcquisitionSource,
  type OwnershipType,
} from "@/lib/fiscal/operations";

export type VehicleOriginState = {
  acquisition_source: AcquisitionSource | "";
  ownership_type: OwnershipType;
  details: Record<string, string>;
};

export const EMPTY_ORIGIN: VehicleOriginState = {
  acquisition_source: "",
  ownership_type: "owned",
  details: {},
};

const ADDRESS_FIELDS: Array<[string, string]> = [
  ["zipcode", "CEP"],
  ["street", "Logradouro"],
  ["number", "Número"],
  ["complement", "Complemento"],
  ["district", "Bairro"],
  ["city", "Município"],
  ["ibge", "Código IBGE"],
  ["uf", "UF"],
];

/**
 * Origem da aquisição + tipo de propriedade do veículo.
 * Apenas COLETA os dados; nenhuma regra tributária é decidida aqui.
 */
export function VehicleOriginSection({
  value,
  onChange,
}: {
  value: VehicleOriginState;
  onChange: (v: VehicleOriginState) => void;
}) {
  const src = value.acquisition_source;
  const setDetail = (k: string, v: string) =>
    onChange({ ...value, details: { ...value.details, [k]: v } });
  const field = (k: string, label: string, placeholder?: string) => (
    <div key={k}>
      <Label>{label}</Label>
      <Input
        value={value.details[k] ?? ""}
        placeholder={placeholder ?? ""}
        onChange={(e) => setDetail(k, e.target.value)}
      />
    </div>
  );

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Origem do veículo
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Origem da aquisição</Label>
          <Select
            value={src || undefined}
            onValueChange={(v) =>
              onChange({ ...value, acquisition_source: v as AcquisitionSource })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {ACQUISITION_SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo de propriedade</Label>
          <Select
            value={value.ownership_type}
            onValueChange={(v) => onChange({ ...value, ownership_type: v as OwnershipType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNERSHIP_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {src === "individual" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Dados do vendedor (pessoa física)</p>
          <div className="grid grid-cols-3 gap-3">
            {field("seller_name", "Nome")}
            {field("seller_cpf", "CPF")}
            {field("seller_phone", "Telefone")}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {ADDRESS_FIELDS.map(([k, l]) => field(k, l))}
          </div>
          <div className="grid grid-cols-2 gap-3">{field("seller_email", "E-mail")}</div>
        </div>
      )}

      {src === "company" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Dados do fornecedor. Nesta operação o fornecedor é o emitente da NF-e — o CRM importa o
            documento.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {field("supplier_name", "Razão social")}
            {field("supplier_cnpj", "CNPJ")}
            {field("supplier_ie", "Inscrição Estadual")}
          </div>
        </div>
      )}

      {src === "auction" && (
        <div className="grid grid-cols-4 gap-3">
          {field("auctioneer_name", "Leiloeiro")}
          {field("auctioneer_cnpj", "CNPJ do leiloeiro")}
          {field("auction_lot", "Nº do lote")}
          {field("auction_date", "Data do leilão")}
        </div>
      )}

      {src === "trade_in" && (
        <div className="grid grid-cols-3 gap-3">
          {field("trade_in_customer", "Cliente")}
          {field("trade_in_document", "CPF/CNPJ")}
          {field("appraisal_amount", "Valor de avaliação (R$)")}
        </div>
      )}

      {(src === "consignment" || value.ownership_type === "consigned") && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Consignação — o veículo não pertence ao estoque próprio e possui perfil fiscal próprio.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {field("consignor_name", "Proprietário")}
            {field("consignor_document", "CPF/CNPJ")}
            {field("consignor_phone", "Telefone")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field("min_agreed_amount", "Valor mínimo acordado (R$)")}
            {field("commission", "Comissão/margem")}
            {field("consignment_date", "Data de entrada")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("contract_ref", "Contrato/referência")}
          </div>
        </div>
      )}
    </div>
  );
}
