CREATE OR REPLACE FUNCTION public.tg_webhook_events_drain_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  req_id BIGINT;
BEGIN
  IF NEW.source = 'evolution' AND NEW.status = 'pending' THEN
    SELECT net.http_post(
      url := 'https://crm.lupusassessoria.com/api/public/hooks/drain-webhook-queue',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) INTO req_id;
    NEW.last_error := 'trigger_request_id:' || COALESCE(req_id::text, 'null');
  END IF;

  RETURN NEW;
END;
$function$;

SELECT cron.alter_job(
  job_id := jobid,
  command := replace(
    command,
    'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app',
    'https://crm.lupusassessoria.com'
  )
)
FROM cron.job
WHERE command LIKE '%https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app%';