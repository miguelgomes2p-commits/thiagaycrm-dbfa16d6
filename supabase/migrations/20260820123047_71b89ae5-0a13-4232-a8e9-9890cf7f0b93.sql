SELECT cron.schedule(
  'reclaim-webhook-events-space',
  '0 5 * * *',
  $$VACUUM (FULL, ANALYZE) public.webhook_events$$
);