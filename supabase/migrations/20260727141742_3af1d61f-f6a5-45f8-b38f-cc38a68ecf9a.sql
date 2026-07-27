
DROP TRIGGER IF EXISTS trg_webhook_events_drain_now ON public.webhook_events;

UPDATE public.webhook_events
SET status='pending', locked_at=NULL
WHERE status='processing' AND locked_at < now() - interval '2 minutes';

DELETE FROM public.webhook_events
WHERE status='done' AND processed_at < now() - interval '2 hours';
