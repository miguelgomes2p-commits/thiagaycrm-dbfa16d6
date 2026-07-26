
ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS n8n_webhook_auth_header TEXT;
