REVOKE ALL ON FUNCTION public.purge_old_webhook_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_operational_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_net_responses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_messages() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purge_old_webhook_events() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_operational_logs() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_net_responses() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_messages() TO postgres, service_role;