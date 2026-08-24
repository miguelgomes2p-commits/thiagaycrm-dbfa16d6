CREATE TABLE public.support_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_staff TO authenticated;
GRANT ALL ON public.support_staff TO service_role;

ALTER TABLE public.support_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own support record"
ON public.support_staff FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_support_staff_updated
BEFORE UPDATE ON public.support_staff
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_staff WHERE user_id = _user_id AND enabled
  );
$$;

-- Suporte enxerga e opera em todos os workspaces (nível admin),
-- mas NÃO herda has_workspace_role (gestão de equipe permanece restrita).
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_support_staff(_user_id) OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_support_staff(_user_id) OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role IN ('owner','admin')
  );
$$;