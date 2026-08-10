import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LeadFields = Record<string, string>;

type FieldDef = { key: string; label: string; placeholder?: string; options?: string[] };

export const LEAD_FIELD_DEFS: FieldDef[] = [
  { key: "origem", label: "Origem", placeholder: "Instagram, Google, indicação..." },
  { key: "canal", label: "Canal", options: ["whatsapp", "instagram", "facebook", "telefone", "presencial", "site"] },
  { key: "classificacao", label: "Classificação", options: ["quente", "morno", "frio"] },
  { key: "campanha", label: "Campanha / Criativo" },
  { key: "interesse", label: "Interesse", placeholder: "Ex: Polo" },
  { key: "categoria", label: "Categoria", placeholder: "Ex: Hatch, SUV..." },
  { key: "forma_pagamento", label: "Forma de pagamento", options: ["à vista", "financiamento", "consórcio", "cartão", "outro"] },
  { key: "entrada", label: "Entrada", placeholder: "Valor ou 'veículo como entrada'" },
  { key: "troca", label: "Troca", options: ["sim", "não"] },
  { key: "veiculo_troca", label: "Veículo na troca", placeholder: "Ex: HB20 2017, 120mil km" },
  { key: "cnh", label: "CNH", options: ["sim", "não"] },
  { key: "nome_limpo", label: "Nome limpo", options: ["sim", "não"] },
  { key: "urgencia", label: "Urgência", placeholder: "Essa semana, este mês..." },
  { key: "ultima_mensagem", label: "Última mensagem" },
];

export function LeadQualifyFields({
  value,
  onChange,
}: {
  value: LeadFields;
  onChange: (v: LeadFields) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {LEAD_FIELD_DEFS.map((f) => (
        <div key={f.key} className={f.key === "ultima_mensagem" ? "col-span-2" : undefined}>
          <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
          {f.options ? (
            <select
              value={value[f.key] ?? ""}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <Input
              className="mt-1"
              value={value[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}
