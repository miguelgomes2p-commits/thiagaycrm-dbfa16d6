CREATE OR REPLACE FUNCTION public.purge_contact(_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ws uuid;
  _owner uuid;
  _convs int := 0;
  _leads int := 0;
  _tasks int := 0;
BEGIN
  SELECT workspace_id, owner_id INTO _ws, _owner FROM public.contacts WHERE id = _contact_id;
  IF _ws IS NULL THEN
    RAISE EXCEPTION 'Contato não encontrado';
  END IF;

  IF _uid IS NULL OR NOT public.is_workspace_member(_ws, _uid) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este contato' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_view_all_workspace(_ws, _uid) AND _owner IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'Sem permissão para excluir este contato' USING ERRCODE = '42501';
  END IF;

  UPDATE public.fiscal_documents SET contact_id = NULL WHERE contact_id = _contact_id;

  WITH d AS (DELETE FROM public.tasks WHERE contact_id = _contact_id RETURNING 1)
  SELECT count(*) INTO _tasks FROM d;

  WITH d AS (DELETE FROM public.conversations WHERE contact_id = _contact_id RETURNING 1)
  SELECT count(*) INTO _convs FROM d;

  UPDATE public.fiscal_documents SET lead_id = NULL
  WHERE lead_id IN (SELECT id FROM public.leads WHERE contact_id = _contact_id);

  WITH d AS (DELETE FROM public.leads WHERE contact_id = _contact_id RETURNING 1)
  SELECT count(*) INTO _leads FROM d;

  DELETE FROM public.contact_birthday_sends WHERE contact_id = _contact_id;
  DELETE FROM public.contacts WHERE id = _contact_id;

  RETURN jsonb_build_object('success', true, 'conversations', _convs, 'leads', _leads, 'tasks', _tasks);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_contact(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_contact(uuid) TO service_role;