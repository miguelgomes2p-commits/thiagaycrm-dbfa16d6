-- 1. event_kind on webhook_events
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS event_kind TEXT NOT NULL DEFAULT 'realtime';

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_kind_created
  ON public.webhook_events (status, event_kind, created_at)
  WHERE status = 'pending';

-- 2. tg_webhook_events_drain_now: capture pg_net request_id for audit
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
      url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-webhook-queue',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) INTO req_id;
    NEW.last_error := 'trigger_request_id:' || COALESCE(req_id::text, 'null');
  END IF;

  RETURN NEW;
END;
$function$;
