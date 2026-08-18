CREATE OR REPLACE FUNCTION public.purge_old_webhook_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.webhook_events
  WHERE status IN ('done', 'failed')
    AND created_at < now() - interval '3 days';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_old_webhook_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_webhook_events() TO service_role;
