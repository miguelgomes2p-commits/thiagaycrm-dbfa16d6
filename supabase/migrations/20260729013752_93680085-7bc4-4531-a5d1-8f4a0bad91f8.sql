ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS wa_profile_name TEXT,
  ADD COLUMN IF NOT EXISTS wa_owner_jid TEXT;