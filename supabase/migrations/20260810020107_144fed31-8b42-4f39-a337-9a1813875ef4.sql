DROP POLICY IF EXISTS "access conversations" ON public.conversations;
CREATE POLICY "access conversations" ON public.conversations
FOR ALL TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (public.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid())
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (public.is_workspace_admin(workspace_id, auth.uid()) OR assigned_to = auth.uid())
);