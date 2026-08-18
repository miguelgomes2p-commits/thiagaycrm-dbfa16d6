// Catálogo client-safe das OPERAÇÕES FISCAIS AUTOMOTIVAS.
// Nada aqui decide tributos: apenas identifica QUAL operação está em curso.
// CFOP/NCM/CST/CSOSN/ICMS/PIS/COFINS/IBS/CBS vêm SEMPRE do Fiscal Operation
// Profile configurado pela contabilidade do workspace.

export type AcquisitionSource =
  | "individual"
  | "company"
  | "auction"
  | "trade_in"
  | "consignment"
  | "other";

export const ACQUISITION_SOURCE_LABEL: Record<AcquisitionSource, string> = {
  individual: "Pessoa Física",
  company: "Empresa",
  auction: "Leilão",
  trade_in: "Veículo recebido na troca",
  consignment: "Consignação",
  other: "Outro",
};

export const ACQUISITION_SOURCE_OPTIONS = (
  Object.keys(ACQUISITION_SOURCE_LABEL) as AcquisitionSource[]
).map((value) => ({ value, label: ACQUISITION_SOURCE_LABEL[value] }));

export type OwnershipType = "owned" | "consigned";

export const OWNERSHIP_TYPE_LABEL: Record<OwnershipType, string> = {
  owned: "Estoque próprio",
  consigned: "Consignado",
};

export const OWNERSHIP_TYPE_OPTIONS = (
  Object.keys(OWNERSHIP_TYPE_LABEL) as OwnershipType[]
).map((value) => ({ value, label: OWNERSHIP_TYPE_LABEL[value] }));

export type FiscalDirection = "entry" | "exit";

export const FISCAL_DIRECTION_LABEL: Record<FiscalDirection, string> = {
  entry: "Entrada",
  exit: "Saída",
};

export type FiscalOperationKey =
  | "vehicle_purchase_non_taxpayer"
  | "vehicle_purchase_taxpayer"
  | "vehicle_purchase_auction"
  | "vehicle_trade_in"
  | "vehicle_sale_own_stock"
  | "vehicle_consignment_entry"
  | "vehicle_consignment_sale"
  | "vehicle_return"
  | "vehicle_transfer";

export type FiscalOperationDef = {
  key: FiscalOperationKey;
  label: string;
  description: string;
  direction: FiscalDirection;
  /** true = a garagem é a emitente do documento; false = o documento vem de terceiro. */
  defaultSelfIssued: boolean;
  /** quando false, o fluxo padrão é IMPORTAR a NF-e do fornecedor. */
  supportsSelfIssue: boolean;
};

export const FISCAL_OPERATIONS: FiscalOperationDef[] = [
  {
    key: "vehicle_purchase_non_taxpayer",
    label: "Aquisição de Pessoa Física",
    description:
      "Compra de veículo de pessoa física / não emitente. A garagem emite a NF-e de entrada quando o perfil fiscal assim determinar.",
    direction: "entry",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_purchase_taxpayer",
    label: "Aquisição de Empresa",
    description:
      "Compra de veículo de empresa contribuinte. O fornecedor emite a NF-e de saída; o CRM importa/vincula o documento.",
    direction: "entry",
    defaultSelfIssued: false,
    supportsSelfIssue: false,
  },
  {
    key: "vehicle_purchase_auction",
    label: "Aquisição em Leilão",
    description:
      "Entrada de veículo arrematado em leilão. O documento pode vir do leiloeiro ou ser emitido conforme o perfil fiscal.",
    direction: "entry",
    defaultSelfIssued: false,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_trade_in",
    label: "Veículo recebido na Troca",
    description:
      "Entrada do veículo entregue pelo cliente como parte do pagamento. Nunca é tratado apenas como desconto.",
    direction: "entry",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_consignment_entry",
    label: "Entrada em Consignação",
    description:
      "Recebimento de veículo consignado. Não segue as regras de estoque próprio.",
    direction: "entry",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_sale_own_stock",
    label: "Venda de Estoque Próprio",
    description: "Venda de veículo de propriedade da garagem.",
    direction: "exit",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_consignment_sale",
    label: "Venda de Veículo Consignado",
    description:
      "Venda de veículo consignado. Exige perfil fiscal próprio validado pela contabilidade.",
    direction: "exit",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_return",
    label: "Devolução de Veículo",
    description: "Devolução/retorno de veículo.",
    direction: "exit",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
  {
    key: "vehicle_transfer",
    label: "Transferência entre Estabelecimentos",
    description: "Transferência de veículo entre filiais do mesmo grupo.",
    direction: "exit",
    defaultSelfIssued: true,
    supportsSelfIssue: true,
  },
];

export function operationDef(key: string | null | undefined): FiscalOperationDef | null {
  return FISCAL_OPERATIONS.find((o) => o.key === key) ?? null;
}

export function operationLabel(key: string | null | undefined): string {
  return operationDef(key)?.label ?? (key ?? "Operação não definida");
}

/**
 * resolveVehicleFiscalOperation — motor de DECISÃO DE OPERAÇÃO (não de tributos).
 * Decide apenas QUAL operation_key deve ser usada; o perfil fiscal configurado
 * pela contabilidade continua sendo a única fonte de CFOP/NCM/CST/IBS/CBS.
 */
export function resolveVehicleFiscalOperation(input: {
  transactionType: "purchase" | "sale";
  acquisitionSource?: AcquisitionSource | string | null;
  ownershipType?: OwnershipType | string | null;
}): { operationKey: FiscalOperationKey; direction: FiscalDirection; selfIssued: boolean; supportsSelfIssue: boolean } {
  const consigned = input.ownershipType === "consigned";

  let key: FiscalOperationKey;
  if (input.transactionType === "sale") {
    key = consigned ? "vehicle_consignment_sale" : "vehicle_sale_own_stock";
  } else if (consigned || input.acquisitionSource === "consignment") {
    key = "vehicle_consignment_entry";
  } else {
    switch (input.acquisitionSource) {
      case "company":
        key = "vehicle_purchase_taxpayer";
        break;
      case "auction":
        key = "vehicle_purchase_auction";
        break;
      case "trade_in":
        key = "vehicle_trade_in";
        break;
      case "individual":
      default:
        key = "vehicle_purchase_non_taxpayer";
    }
  }

  const def = operationDef(key)!;
  return {
    operationKey: key,
    direction: def.direction,
    selfIssued: def.defaultSelfIssued,
    supportsSelfIssue: def.supportsSelfIssue,
  };
}

/** Indicador de IE do destinatário conforme layout NF-e. */
export type TaxpayerIndicator = "contributor" | "exempt" | "non_contributor";

export const TAXPAYER_INDICATOR_LABEL: Record<TaxpayerIndicator, string> = {
  contributor: "Contribuinte de ICMS",
  exempt: "Contribuinte isento de IE",
  non_contributor: "Não contribuinte",
};

export function taxpayerIndicatorCode(v: TaxpayerIndicator | undefined): 1 | 2 | 9 {
  if (v === "contributor") return 1;
  if (v === "exempt") return 2;
  return 9;
}

/** Presença do comprador (indPres) — nunca hardcodar presencial. */
export const BUYER_PRESENCE_OPTIONS = [
  { value: 0, label: "Não se aplica" },
  { value: 1, label: "Presencial" },
  { value: 2, label: "Internet" },
  { value: 3, label: "Teleatendimento" },
  { value: 4, label: "NFC-e entrega em domicílio" },
  { value: 5, label: "Presencial fora do estabelecimento" },
  { value: 9, label: "Não presencial — outros" },
] as const;
