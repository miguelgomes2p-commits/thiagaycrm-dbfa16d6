
CREATE POLICY "members manage own whatsapp numbers"
ON public.whatsapp_numbers
FOR ALL
TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND default_owner_id = auth.uid()
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND default_owner_id = auth.uid()
);
