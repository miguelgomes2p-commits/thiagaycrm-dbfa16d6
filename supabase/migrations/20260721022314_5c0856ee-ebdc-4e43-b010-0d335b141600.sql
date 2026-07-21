DROP POLICY IF EXISTS "members access workspace whatsapp numbers" ON public.whatsapp_numbers;

CREATE POLICY "members can read workspace whatsapp numbers"
ON public.whatsapp_numbers
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins can manage workspace whatsapp numbers"
ON public.whatsapp_numbers
FOR ALL
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));