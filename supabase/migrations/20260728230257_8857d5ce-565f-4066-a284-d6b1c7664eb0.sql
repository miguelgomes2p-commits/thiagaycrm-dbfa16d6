-- Remove o cron unificado atual
SELECT cron.unschedule('drain-webhook-queue-15s');

-- Cron A: realtime a cada 5s (prioridade máxima para mensagens novas)
SELECT cron.schedule(
  'drain-webhook-queue-realtime-5s',
  '5 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue?kind=realtime',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"kind":"realtime"}'::jsonb,
    timeout_milliseconds := 20000
  ) AS request_id;
  $$
);

-- Cron B: history a cada 30s (sincronizações retroativas, sem pressa)
SELECT cron.schedule(
  'drain-webhook-queue-history-30s',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue?kind=history',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"kind":"history"}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $$
);