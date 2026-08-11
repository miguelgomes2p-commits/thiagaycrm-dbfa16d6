-- Purge old webhook_events to prevent unbounded table growth.
-- The table had 117K+ rows with massive JSONB payloads, causing slow queue scans.
-- Keep only 3 days of processed/failed events for debugging; pending events are never purged.

CREATE OR REPLACE FUNCTION public.purge_old_webhook_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.webhook_events
  WHERE status IN ('processed', 'failed', 'skipped', 'error')
    AND created_at < now() - interval '3 days';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_old_webhook_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_webhook_events() TO service_role;

-- Immediately purge existing old events (one-time cleanup of 117K backlog)
DELETE FROM public.webhook_events
WHERE status IN ('processed', 'failed', 'skipped', 'error')
  AND created_at < now() - interval '3 days';

-- Schedule daily purge at 03:30 UTC (after the existing purge_old_messages at 03:15)
SELECT cron.schedule(
  'purge-old-webhook-events',
  '30 3 * * *',
  $$SELECT public.purge_old_webhook_events();$$
);
