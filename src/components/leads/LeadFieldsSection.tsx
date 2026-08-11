import { useLeadFields } from "@/hooks/useLeadFields";
import { DynamicLeadForm } from "@/components/leads/DynamicLeadForm";
import { LeadQualifyFields } from "@/components/pipeline/LeadQualifyFields";
import type { FieldContext, LeadFieldValues } from "@/lib/lead-fields";

/**
 * Ponte entre o motor dinâmico e o formulário legado: se o workspace já tem
 * definições cadastradas, usa o registry; caso contrário mantém os campos de
 * qualificação padrão para não quebrar quem ainda não configurou nada.
 */
export function LeadFieldsSection({
  workspaceId,
  values,
  onChange,
  context,
  pipelineId,
  stageId,
  errors,
  members,
}: {
  workspaceId?: string | null;
  values: LeadFieldValues;
  onChange: (v: LeadFieldValues) => void;
  context: FieldContext;
  pipelineId?: string | null;
  stageId?: string | null;
  errors?: Record<string, string>;
  members?: { id: string; name: string }[];
}) {
  const { data } = useLeadFields(workspaceId);
  const defs = (data?.definitions ?? []).filter((d) => d.is_active);

  if (defs.length === 0) {
    return (
      <LeadQualifyFields
        value={values as Record<string, string>}
        onChange={(v) => onChange(v)}
      />
    );
  }

  return (
    <DynamicLeadForm
      definitions={defs}
      groups={data?.groups ?? []}
      values={values}
      onChange={onChange}
      context={context}
      pipelineId={pipelineId ?? null}
      stageId={stageId ?? null}
      errors={errors}
      members={members}
    />
  );
}
