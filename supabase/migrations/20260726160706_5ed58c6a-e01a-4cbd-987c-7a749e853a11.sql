DROP POLICY IF EXISTS "access conversations" ON public.conversations;
CREATE POLICY "access conversations"
ON public.conversations
FOR ALL
TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  )
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR assigned_to = auth.uid()
    OR assigned_to IS NULL
  )
);

CREATE OR REPLACE FUNCTION public.can_access_conversation(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
      AND public.is_workspace_member(c.workspace_id, _user_id)
      AND (
        public.is_workspace_admin(c.workspace_id, _user_id)
        OR c.assigned_to = _user_id
        OR c.assigned_to IS NULL
      )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.can_access_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_conversation(uuid, uuid) TO service_role;