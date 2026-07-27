
-- Substitui cron de 1 minuto por 15s (pg_cron 1.6+ suporta segundos).
SELECT cron.unschedule('drain-webhook-queue-1m') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='drain-webhook-queue-1m');

SELECT cron.schedule(
  'drain-webhook-queue-15s',
  '15 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);

-- Reabre eventos "processing" travados agora e limpa o backlog atual disparando um drain imediato.
UPDATE public.webhook_events
SET status='pending', locked_at=NULL
WHERE status='processing' AND locked_at < now() - interval '30 seconds';

SELECT net.http_post(
  url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue',
  headers := '{"Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb,
  timeout_milliseconds := 55000
);
