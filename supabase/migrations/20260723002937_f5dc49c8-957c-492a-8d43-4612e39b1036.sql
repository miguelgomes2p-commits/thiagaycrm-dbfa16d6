
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS allowed_roles public.app_role[]
  NOT NULL DEFAULT ARRAY['owner','admin','manager','agent']::public.app_role[];

CREATE OR REPLACE FUNCTION public.tg_leads_enforce_stage_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
  stage_roles public.app_role[];
  stage_name TEXT;
BEGIN
  -- Only enforce when stage changes (or on insert)
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  -- Skip when no auth context (server-side jobs / service_role)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO user_role
  FROM public.workspace_members
  WHERE workspace_id = NEW.workspace_id AND user_id = auth.uid();

  -- Owner/Admin always allowed
  IF user_role IS NULL OR user_role IN ('owner','admin') THEN
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

DROP TRIGGER IF EXISTS trg_leads_enforce_stage_role ON public.leads;
CREATE TRIGGER trg_leads_enforce_stage_role
BEFORE INSERT OR UPDATE OF stage_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_enforce_stage_role();
