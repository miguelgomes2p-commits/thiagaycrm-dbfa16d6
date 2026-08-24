ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';

-- Mover leads: suporte equiparado a owner/admin
CREATE OR REPLACE FUNCTION public.tg_leads_enforce_stage_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF user_role IS NULL OR user_role IN ('owner','admin','support') THEN
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
$function$;

-- Round robin nunca deve escolher suporte
CREATE OR REPLACE FUNCTION public.assign_next_agent(_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT user_id INTO next_user
  FROM public.workspace_members wm
  WHERE wm.workspace_id = _workspace_id
    AND wm.role <> 'support'
    AND (
      _mode IS DISTINCT FROM 'shared'
      OR (wm.role NOT IN ('owner','admin') AND wm.is_active AND wm.accepts_new_leads)
    )
    AND (last_user IS NULL OR wm.user_id > last_user)
  ORDER BY wm.user_id
  LIMIT 1;

  IF next_user IS NULL THEN
    SELECT user_id INTO next_user
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.role <> 'support'
      AND (
        _mode IS DISTINCT FROM 'shared'
        OR (wm.role NOT IN ('owner','admin') AND wm.is_active AND wm.accepts_new_leads)
      )
    ORDER BY wm.user_id
    LIMIT 1;
  END IF;

  IF next_user IS NOT NULL THEN
    UPDATE public.queue_settings
      SET last_assigned_user_id = next_user, updated_at = now()
    WHERE workspace_id = _workspace_id;
  END IF;

  RETURN next_user;
END;
$function$;

-- Sincroniza membros de suporte em todos os workspaces
CREATE OR REPLACE FUNCTION public.sync_support_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.workspace_members wm
  WHERE wm.role = 'support'
    AND NOT EXISTS (
      SELECT 1 FROM public.support_staff s
      WHERE s.user_id = wm.user_id AND s.enabled
    );

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT w.id, s.user_id, 'support'
  FROM public.workspaces w
  CROSS JOIN public.support_staff s
  WHERE s.enabled
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = w.id AND m.user_id = s.user_id
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_support_memberships() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.sync_support_memberships() TO service_role;

CREATE OR REPLACE FUNCTION public.tg_support_staff_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_support_memberships();
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_support_staff_sync
AFTER INSERT OR UPDATE OR DELETE ON public.support_staff
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_support_staff_sync();

CREATE OR REPLACE FUNCTION public.tg_workspace_add_support()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT NEW.id, s.user_id, 'support'
  FROM public.support_staff s
  WHERE s.enabled
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = NEW.id AND m.user_id = s.user_id
    );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_workspace_add_support
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_add_support();