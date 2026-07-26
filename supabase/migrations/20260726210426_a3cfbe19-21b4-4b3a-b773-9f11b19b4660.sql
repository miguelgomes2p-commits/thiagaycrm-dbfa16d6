CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tg_webhook_events_drain_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.source = 'evolution' AND NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_events_drain_now ON public.webhook_events;
CREATE TRIGGER trg_webhook_events_drain_now
AFTER INSERT ON public.webhook_events
FOR EACH ROW
EXECUTE FUNCTION public.tg_webhook_events_drain_now();