REVOKE ALL ON FUNCTION public.purge_old_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_messages() TO service_role;