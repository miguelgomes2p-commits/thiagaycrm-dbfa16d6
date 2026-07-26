REVOKE ALL ON FUNCTION public.tg_webhook_events_drain_now() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_webhook_events_drain_now() FROM anon;
REVOKE ALL ON FUNCTION public.tg_webhook_events_drain_now() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tg_webhook_events_drain_now() TO service_role;