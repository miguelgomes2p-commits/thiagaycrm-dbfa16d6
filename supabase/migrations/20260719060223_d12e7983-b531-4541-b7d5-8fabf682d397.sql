
-- Public wrappers to allow supabaseAdmin (service_role) to invoke private-schema functions via PostgREST rpc().
-- Only service_role gets EXECUTE, so anon/authenticated cannot call them (preserves prior security hardening).

CREATE OR REPLACE FUNCTION public.create_workspace_with_defaults(_name text, _slug text, _user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT private.create_workspace_with_defaults(_name, _slug, _user_id);
$$;

REVOKE ALL ON FUNCTION public.create_workspace_with_defaults(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_defaults(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.renave_seed_endpoints(_workspace_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT private.renave_seed_endpoints(_workspace_id);
$$;

REVOKE ALL ON FUNCTION public.renave_seed_endpoints(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renave_seed_endpoints(uuid) TO service_role;
