-- Allow all workspace members to READ contacts (fixes "Anônimo" in agent view).
-- Keeps write ownership: only owner/admin or the owner_id may modify.
DROP POLICY IF EXISTS "access contacts" ON public.contacts;

CREATE POLICY "members read contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "owner/admin write contacts"
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR owner_id = auth.uid()
    OR owner_id IS NULL
  )
);

CREATE POLICY "owner/admin update contacts"
ON public.contacts
FOR UPDATE
TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR owner_id = auth.uid()
  )
)
WITH CHECK (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR owner_id = auth.uid()
  )
);

CREATE POLICY "owner/admin delete contacts"
ON public.contacts
FOR DELETE
TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR owner_id = auth.uid()
  )
);