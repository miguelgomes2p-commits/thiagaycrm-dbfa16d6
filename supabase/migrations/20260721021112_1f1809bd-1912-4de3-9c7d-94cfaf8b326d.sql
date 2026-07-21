CREATE TABLE public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  token_hash text NOT NULL UNIQUE,
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_invitations_email_len CHECK (char_length(email) <= 320),
  CONSTRAINT workspace_invitations_pending_unique UNIQUE (workspace_id, email, accepted_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins can view invitations"
ON public.workspace_invitations
FOR SELECT
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "Workspace admins can create invitations"
ON public.workspace_invitations
FOR INSERT
TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "Workspace admins can update invitations"
ON public.workspace_invitations
FOR UPDATE
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "Workspace admins can delete invitations"
ON public.workspace_invitations
FOR DELETE
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE TRIGGER workspace_invitations_updated_at
BEFORE UPDATE ON public.workspace_invitations
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX workspace_invitations_workspace_idx ON public.workspace_invitations(workspace_id, created_at DESC);
CREATE INDEX workspace_invitations_email_idx ON public.workspace_invitations(lower(email));