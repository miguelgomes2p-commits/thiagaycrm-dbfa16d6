import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  type LeadFieldDefinition,
  type LeadFieldGroup,
  type LeadFieldValues,
  type FieldContext,
  applyCustomMask,
  formatCurrencyBRL,
  isFieldRequired,
  isFieldVisible,
  maskCep,
  maskCnpj,
  maskCpf,
  maskPhoneBr,
  toCanonicalValue,
} from "@/lib/lead-fields";

type Props = {
  definitions: LeadFieldDefinition[];
  groups: LeadFieldGroup[];
  values: LeadFieldValues;
  onChange: (values: LeadFieldValues) => void;
  context: FieldContext;
  pipelineId?: string | null;
  stageId?: string | null;
  errors?: Record<string, string>;
  members?: { id: string; name: string }[];
  compact?: boolean;
};

function displayFor(def: LeadFieldDefinition, raw: string): string {
  switch (def.field_type) {
    case "CPF": return maskCpf(raw);
    case "CNPJ": return maskCnpj(raw);
    case "CPF_CNPJ": return raw.replace(/\D/g, "").length > 11 ? maskCnpj(raw) : maskCpf(raw);
    case "CEP": return maskCep(raw);
    case "PHONE": return maskPhoneBr(raw);
    case "CUSTOM_MASK": {
      const mask = String((def.validation as { mask?: string }).mask ?? "");
      return mask ? applyCustomMask(raw, mask) : raw;
    }
    default: return raw;
  }
}

function FieldControl({
  def, value, onChange, invalid, members,
}: {
  def: LeadFieldDefinition;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  members?: { id: string; name: string }[];
}) {
  const base = cn("mt-1", invalid && "border-destructive focus-visible:ring-destructive");
  const selectClass = cn(
    "mt-1 w-full h-10 rounded-md border border-input bg-background px-2 text-sm",
    invalid && "border-destructive",
  );

  switch (def.field_type) {
    case "TEXTAREA":
    case "ADDRESS":
      return (
        <Textarea
          className={base}
          rows={3}
          value={value}
          placeholder={def.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "BOOLEAN":
    case "CHECKBOX":
      return (
        <div className="mt-2 flex items-center gap-2">
          <Switch checked={value === "true"} onCheckedChange={(c) => onChange(c ? "true" : "false")} />
          <span className="text-xs text-muted-foreground">{value === "true" ? "Sim" : "Não"}</span>
        </div>
      );
    case "SINGLE_SELECT":
    case "RADIO":
      return (
        <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {def.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      );
    case "MULTI_SELECT": {
      const selected = value ? value.split(",").filter(Boolean) : [];
      return (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {def.options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange((on ? selected.filter((s) => s !== o.id) : [...selected, o.id]).join(","))}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  on ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            );
          })}
          {def.options.length === 0 && <span className="text-xs text-muted-foreground">Sem opções configuradas</span>}
        </div>
      );
    }
    case "USER":
      return (
        <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      );
    case "DATE":
      return <Input type="date" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
    case "DATETIME":
      return <Input type="datetime-local" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
    case "TIME":
      return <Input type="time" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
    case "CURRENCY":
    case "PERCENTAGE":
    case "DECIMAL":
    case "INTEGER":
      return (
        <div className="relative">
          <Input
            className={base}
            inputMode="decimal"
            value={value}
            placeholder={def.placeholder ?? (def.field_type === "CURRENCY" ? "0,00" : "")}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
          />
          {def.field_type === "CURRENCY" && value !== "" && Number.isFinite(Number(toCanonicalValue(def, value))) && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">
              {formatCurrencyBRL(Number(toCanonicalValue(def, value)))}
            </span>
          )}
        </div>
      );
    case "EMAIL":
      return <Input type="email" className={base} value={value} placeholder={def.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "URL":
    case "FILE":
    case "IMAGE":
      return <Input type="url" className={base} value={value} placeholder={def.placeholder ?? "https://"} onChange={(e) => onChange(e.target.value)} />;
    default:
      return (
        <Input
          className={base}
          value={displayFor(def, value)}
          placeholder={def.placeholder ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/**
 * Motor central de formulário. Todos os cadastros de Lead (conversa,
 * pipeline, detalhes) usam este componente — não existe formulário paralelo.
 */
export function DynamicLeadForm({
  definitions, groups, values, onChange, context, pipelineId, stageId, errors, members, compact,
}: Props) {
  const visible = useMemo(
    () => definitions
      .filter((d) => isFieldVisible(d, { context, pipelineId: pipelineId ?? null, values }))
      .sort((a, b) => a.sort_order - b.sort_order),
    [definitions, context, pipelineId, values],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; order: number; fields: LeadFieldDefinition[] }>();
    for (const def of visible) {
      const g = groups.find((x) => x.id === def.group_id);
      const key = g?.id ?? "__none__";
      if (!map.has(key)) map.set(key, { name: g?.name ?? "Outros campos", order: g?.sort_order ?? 999, fields: [] });
      map.get(key)!.fields.push(def);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [visible, groups]);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.name}>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group.name}</h4>
          <div className={cn("grid gap-3", compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
            {group.fields.map((def) => {
              const required = isFieldRequired(def, { values, stageId: stageId ?? null });
              const error = errors?.[def.field_key];
              const wide = def.field_type === "TEXTAREA" || def.field_type === "ADDRESS" || def.field_type === "MULTI_SELECT";
              return (
                <div key={def.id} className={wide ? "sm:col-span-2" : undefined}>
                  <Label className="text-[11px] text-muted-foreground">
                    {def.label}{required && <span className="text-destructive"> *</span>}
                  </Label>
                  <FieldControl
                    def={def}
                    value={values[def.field_key] ?? ""}
                    onChange={(v) => onChange({ ...values, [def.field_key]: v })}
                    invalid={!!error}
                    members={members}
                  />
                  {def.help_text && !error && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{def.help_text}</p>
                  )}
                  {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
