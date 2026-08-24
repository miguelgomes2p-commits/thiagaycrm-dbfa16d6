
-- 1) Visibilidade ampla (admin-like) incluindo manager
CREATE OR REPLACE FUNCTION public.can_view_all_workspace(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
      AND role IN ('owner','admin','support','manager')
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_all_workspace(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_all_workspace(uuid, uuid) TO authenticated, service_role;

-- 2) Políticas: manager passa a ver tudo
DROP POLICY IF EXISTS "access conversations" ON public.conversations;
CREATE POLICY "access conversations" ON public.conversations
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR assigned_to = auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR assigned_to = auth.uid()));

DROP POLICY IF EXISTS "access leads" ON public.leads;
CREATE POLICY "access leads" ON public.leads
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR owner_id = auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR owner_id = auth.uid()));

DROP POLICY IF EXISTS "access tasks" ON public.tasks;
CREATE POLICY "access tasks" ON public.tasks
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid()));

DROP POLICY IF EXISTS "access activities" ON public.activities;
CREATE POLICY "access activities" ON public.activities
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = activities.lead_id AND l.owner_id = auth.uid())))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = activities.lead_id AND l.owner_id = auth.uid())));

DROP POLICY IF EXISTS "owner/admin update contacts" ON public.contacts;
CREATE POLICY "owner/admin update contacts" ON public.contacts
FOR UPDATE TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR owner_id = auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR owner_id = auth.uid()));

DROP POLICY IF EXISTS "owner/admin delete contacts" ON public.contacts;
CREATE POLICY "owner/admin delete contacts" ON public.contacts
FOR DELETE TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND (public.can_view_all_workspace(workspace_id, auth.uid()) OR owner_id = auth.uid()));

-- 3) Manager pode mover leads em qualquer etapa
CREATE OR REPLACE FUNCTION public.tg_leads_enforce_stage_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
  stage_roles public.app_role[];
  stage_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO user_role
  FROM public.workspace_members
  WHERE workspace_id = NEW.workspace_id AND user_id = auth.uid();

  IF user_role IS NULL OR user_role IN ('owner','admin','support','manager') THEN
    RETURN NEW;
  END IF;

  SELECT allowed_roles, name INTO stage_roles, stage_name
  FROM public.pipeline_stages
  WHERE id = NEW.stage_id;

  IF stage_roles IS NULL OR user_role = ANY(stage_roles) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Seu cargo (%) não tem permissão para mover leads para a etapa "%"', user_role, stage_name
    USING ERRCODE = '42501';
END;
$$;

-- 4) Round robin igualitário: menor carga primeiro
CREATE OR REPLACE FUNCTION public.assign_next_agent(_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_user UUID;
  last_user UUID;
  _mode public.workspace_mode;
BEGIN
  SELECT workspace_mode INTO _mode FROM public.workspaces WHERE id = _workspace_id;

  INSERT INTO public.queue_settings (workspace_id)
  VALUES (_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT last_assigned_user_id INTO last_user
  FROM public.queue_settings
  WHERE workspace_id = _workspace_id
  FOR UPDATE;

  SELECT wm.user_id INTO next_user
  FROM public.workspace_members wm
  CROSS JOIN LATERAL (
    SELECT count(*) AS load
    FROM public.conversations c
    WHERE c.workspace_id = _workspace_id
      AND c.assigned_to = wm.user_id
      AND c.created_at > now() - interval '30 days'
  ) k
  WHERE wm.workspace_id = _workspace_id
    AND wm.role <> 'support'
    AND (
      _mode IS DISTINCT FROM 'shared'
      OR (wm.role NOT IN ('owner','admin') AND wm.is_active AND wm.accepts_new_leads)
    )
  ORDER BY k.load ASC, (wm.user_id IS NOT DISTINCT FROM last_user), random()
  LIMIT 1;

  IF next_user IS NOT NULL THEN
    UPDATE public.queue_settings
      SET last_assigned_user_id = next_user, updated_at = now()
    WHERE workspace_id = _workspace_id;
  END IF;

  RETURN next_user;
END;
$$;
