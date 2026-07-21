REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.app_role[]) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.app_role[]) TO service_role;