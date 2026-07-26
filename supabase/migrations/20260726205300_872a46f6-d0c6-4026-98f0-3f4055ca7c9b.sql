
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'evolution',
  whatsapp_number_id UUID,
  payload JSONB NOT NULL,
  raw_body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.webhook_events_id_seq TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON public.webhook_events (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created
  ON public.webhook_events (status, created_at);
