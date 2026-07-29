
-- 1) Preenche last_message_at nas conversas sem valor
UPDATE public.conversations c
SET last_message_at = COALESCE(
  (SELECT MAX(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id),
  c.created_at
)
WHERE c.last_message_at IS NULL;

-- 2) Regulariza current_workspace_id vazio no profile usando o primeiro workspace do membro
UPDATE public.profiles p
SET current_workspace_id = wm.workspace_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, workspace_id
  FROM public.workspace_members
  ORDER BY user_id, created_at ASC
) wm
WHERE p.id = wm.user_id AND p.current_workspace_id IS NULL;
