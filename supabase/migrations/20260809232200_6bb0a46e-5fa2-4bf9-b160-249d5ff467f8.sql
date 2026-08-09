CREATE TABLE IF NOT EXISTS public.n8n_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id UUID REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  webhook_event_id BIGINT,
  wa_message_id TEXT NOT NULL,
  trace_id TEXT,
  request_id TEXT,
  phone TEXT,
  event_name TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  http_status INTEGER,
  response_body TEXT,
  last_error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT n8n_deliveries_unique_msg UNIQUE (whatsapp_number_id, wa_message_id)
);

GRANT SELECT ON public.n8n_deliveries TO authenticated;
GRANT ALL ON public.n8n_deliveries TO service_role;

ALTER TABLE public.n8n_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view n8n deliveries"
ON public.n8n_deliveries FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_n8n_deliveries_pending
  ON public.n8n_deliveries (status, next_retry_at)
  WHERE status IN ('pending', 'retry');

CREATE INDEX IF NOT EXISTS idx_n8n_deliveries_ws_created
  ON public.n8n_deliveries (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_n8n_deliveries_trace
  ON public.n8n_deliveries (trace_id);

CREATE TRIGGER trg_n8n_deliveries_updated
BEFORE UPDATE ON public.n8n_deliveries
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS n8n_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS n8n_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS n8n_status TEXT;