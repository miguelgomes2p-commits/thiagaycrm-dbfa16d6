-- Provider type
DO $$ BEGIN
  CREATE TYPE public.wa_provider AS ENUM ('cloud_api', 'evolution', 'zapi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wa_connection_status AS ENUM ('disconnected','qr','connecting','connected','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS provider public.wa_provider NOT NULL DEFAULT 'cloud_api',
  ADD COLUMN IF NOT EXISTS provider_base_url TEXT,
  ADD COLUMN IF NOT EXISTS provider_api_key TEXT,
  ADD COLUMN IF NOT EXISTS instance_name TEXT,
  ADD COLUMN IF NOT EXISTS connection_status public.wa_connection_status NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS last_qr TEXT,
  ADD COLUMN IF NOT EXISTS last_qr_at TIMESTAMPTZ;

-- Cloud API-specific fields become optional (Evolution/Z-API don't have them)
ALTER TABLE public.whatsapp_numbers ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.whatsapp_numbers ALTER COLUMN phone_number_id DROP NOT NULL;
ALTER TABLE public.whatsapp_numbers ALTER COLUMN waba_id DROP NOT NULL;

-- Fast lookup by instance for webhook
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_instance ON public.whatsapp_numbers(instance_name) WHERE instance_name IS NOT NULL;