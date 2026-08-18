REVOKE EXECUTE ON FUNCTION public.purge_old_webhook_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_old_webhook_events() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_old_webhook_events() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_webhook_events() TO service_role;