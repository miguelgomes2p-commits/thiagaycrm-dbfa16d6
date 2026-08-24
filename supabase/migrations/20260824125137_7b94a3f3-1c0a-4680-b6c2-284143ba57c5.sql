REVOKE EXECUTE ON FUNCTION public.is_support_staff(uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.is_support_staff(uuid) TO service_role;