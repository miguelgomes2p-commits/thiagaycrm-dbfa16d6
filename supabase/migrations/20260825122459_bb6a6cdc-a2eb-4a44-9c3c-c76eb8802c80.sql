CREATE OR REPLACE FUNCTION public.tg_enforce_single_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _existing int;
BEGIN
  -- Suporte global pode participar de todos os workspaces
  IF NEW.role = 'support' OR public.is_support_staff(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.user_id;

  -- Admin global (super admin) fica livre da trava
  IF _email = 'miguelgomes2p@gmail.com' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _existing
  FROM public.workspace_members
  WHERE user_id = NEW.user_id
    AND workspace_id IS DISTINCT FROM NEW.workspace_id;

  IF _existing > 0 THEN
    RAISE EXCEPTION 'Este usuário já pertence a um workspace. Usuários comuns podem participar de apenas um workspace.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_workspace ON public.workspace_members;
CREATE TRIGGER trg_enforce_single_workspace
BEFORE INSERT ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_single_workspace();