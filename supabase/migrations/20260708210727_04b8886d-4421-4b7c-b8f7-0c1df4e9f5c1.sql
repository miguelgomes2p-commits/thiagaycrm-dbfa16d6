
-- Trigger functions never need direct execute
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- RLS helpers: revoke from anon (only authenticated users evaluate policies against tenant data)
REVOKE ALL ON FUNCTION public.is_workspace_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_role(UUID, UUID, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, UUID, public.app_role[]) TO authenticated;

-- Workspace bootstrap: only authenticated users can call
REVOKE ALL ON FUNCTION public.create_workspace_with_defaults(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_defaults(TEXT, TEXT) TO authenticated;
