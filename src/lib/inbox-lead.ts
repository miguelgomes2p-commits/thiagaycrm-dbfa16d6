/**
 * Regras da etapa "Caixa de Entrada" da Pipeline.
 *
 * Toda nova conversa gera automaticamente um Lead nesta etapa (trigger no banco).
 * Ao salvar/editar os dados desse Lead pela primeira vez, ele deve sair da
 * Caixa de Entrada e ir para a primeira etapa operacional do workspace.
 */

export type StageLike = {
  id: string;
  name: string;
  position: number;
  type?: string | null;
  is_inbox?: boolean | null;
};

export function isInboxStage(stage: StageLike | undefined | null): boolean {
  return !!stage?.is_inbox;
}

/** Primeira etapa operacional (a primeira depois da Caixa de Entrada, pela ordem da pipeline). */
export function firstOperationalStageId(stages: StageLike[]): string | null {
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const operational = ordered.filter((s) => !s.is_inbox);
  if (operational.length === 0) return null;
  const named = operational.find((s) => s.name.trim().toLowerCase() === "novo lead");
  return (named ?? operational[0]!).id;
}

/**
 * Retorna a etapa de destino quando o lead está na Caixa de Entrada,
 * ou `null` quando ele já está em outra etapa (não deve ser movido).
 */
export function stageAfterInboxEdit(stages: StageLike[], currentStageId: string): string | null {
  const current = stages.find((s) => s.id === currentStageId);
  if (!isInboxStage(current)) return null;
  const target = firstOperationalStageId(stages);
  return target && target !== currentStageId ? target : null;
}
