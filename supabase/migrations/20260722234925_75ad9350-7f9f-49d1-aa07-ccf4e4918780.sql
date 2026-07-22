CREATE UNIQUE INDEX IF NOT EXISTS messages_workspace_wa_message_unique
ON public.messages (workspace_id, wa_message_id)
WHERE wa_message_id IS NOT NULL;