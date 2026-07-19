
CREATE OR REPLACE FUNCTION private.create_workspace_with_defaults(_name text, _slug text, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_ws_id UUID;
  new_pipeline_id UUID;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user id required'; END IF;

  INSERT INTO public.workspaces (name, slug, created_by)
  VALUES (_name, _slug, _user_id)
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, _user_id, 'owner');

  INSERT INTO public.pipelines (workspace_id, name, is_default, position)
  VALUES (new_ws_id, 'Pipeline principal', true, 0)
  RETURNING id INTO new_pipeline_id;

  INSERT INTO public.pipeline_stages (pipeline_id, workspace_id, name, position, color, type) VALUES
    (new_pipeline_id, new_ws_id, 'Novo Lead',       0, '#6366f1', 'open'),
    (new_pipeline_id, new_ws_id, 'Contato',         1, '#0ea5e9', 'open'),
    (new_pipeline_id, new_ws_id, 'Qualificado',     2, '#8b5cf6', 'open'),
    (new_pipeline_id, new_ws_id, 'Proposta',        3, '#f59e0b', 'open'),
    (new_pipeline_id, new_ws_id, 'Negociação',      4, '#f97316', 'open'),
    (new_pipeline_id, new_ws_id, 'Fechado Ganho',   5, '#22c55e', 'won'),
    (new_pipeline_id, new_ws_id, 'Fechado Perdido', 6, '#ef4444', 'lost');

  UPDATE public.profiles SET current_workspace_id = new_ws_id WHERE id = _user_id;

  RETURN new_ws_id;
END;
$function$;

-- Remove overload antigo sem _user_id caso ainda exista
DROP FUNCTION IF EXISTS private.create_workspace_with_defaults(text, text);

REVOKE EXECUTE ON FUNCTION private.create_workspace_with_defaults(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_workspace_with_defaults(text, text, uuid) TO service_role;
