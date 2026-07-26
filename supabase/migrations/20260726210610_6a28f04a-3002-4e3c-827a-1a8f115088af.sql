DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'drain-webhook-queue-10s') THEN
    PERFORM cron.unschedule('drain-webhook-queue-10s');
  END IF;
END $$;

SELECT cron.schedule(
  'drain-webhook-queue-1m',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) AS request_id;
  $$
);