-- Enums
CREATE TYPE public.queue_strategy AS ENUM ('round_robin', 'manual', 'hybrid');
CREATE TYPE public.wa_delivery_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE public.wa_template_status AS ENUM ('pending', 'approved', 'rejected', 'paused');

-- WhatsApp numbers
CREATE TABLE public.whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  display_number TEXT NOT NULL,
  phone_number_id TEXT NOT NULL UNIQUE,
  waba_id TEXT NOT NULL,
  app_id TEXT,
  access_token TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_reply_prompt TEXT,
  default_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_webhook_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_numbers TO authenticated;
GRANT ALL ON public.whatsapp_numbers TO service_role;

ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access workspace whatsapp numbers"
ON public.whatsapp_numbers FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_whatsapp_numbers_updated
BEFORE UPDATE ON public.whatsapp_numbers
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- WhatsApp templates
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id UUID NOT NULL REFERENCES public.whatsapp_numbers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT,
  status public.wa_template_status NOT NULL DEFAULT 'pending',
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_number_id, name, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access workspace templates"
ON public.whatsapp_templates FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_whatsapp_templates_updated
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Queue settings (one per workspace)
CREATE TABLE public.queue_settings (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  strategy public.queue_strategy NOT NULL DEFAULT 'round_robin',
  sla_minutes INTEGER NOT NULL DEFAULT 15,
  last_assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_settings TO authenticated;
GRANT ALL ON public.queue_settings TO service_role;

ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access queue settings"
ON public.queue_settings FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_queue_settings_updated
BEFORE UPDATE ON public.queue_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Queue entries
CREATE TABLE public.queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX idx_queue_entries_workspace_open ON public.queue_entries (workspace_id, resolved_at, entered_at);
CREATE INDEX idx_queue_entries_assigned ON public.queue_entries (assigned_to) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_entries TO authenticated;
GRANT ALL ON public.queue_entries TO service_role;

ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members access queue entries"
ON public.queue_entries FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_queue_entries_updated
BEFORE UPDATE ON public.queue_entries
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Extend conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS whatsapp_number_id UUID REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS wa_contact_wa_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_wa_contact
  ON public.conversations (whatsapp_number_id, wa_contact_wa_id);

-- Extend messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status public.wa_delivery_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON public.messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Round-robin assignment function (SECURITY DEFINER so webhook + serverfn can call)
CREATE OR REPLACE FUNCTION public.assign_next_agent(_workspace_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_user UUID;
  last_user UUID;
BEGIN
  SELECT last_assigned_user_id INTO last_user
  FROM public.queue_settings WHERE workspace_id = _workspace_id;

  -- pick next member in stable order after the last assigned; wrap around
  SELECT user_id INTO next_user FROM (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY user_id) AS rn,
           COUNT(*) OVER () AS total
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
  ) m
  WHERE last_user IS NULL
     OR m.user_id > last_user
  ORDER BY m.user_id
  LIMIT 1;

  IF next_user IS NULL THEN
    SELECT user_id INTO next_user
    FROM public.workspace_members
    WHERE workspace_id = _workspace_id
    ORDER BY user_id
    LIMIT 1;
  END IF;

  IF next_user IS NOT NULL THEN
    INSERT INTO public.queue_settings (workspace_id, last_assigned_user_id)
    VALUES (_workspace_id, next_user)
    ON CONFLICT (workspace_id) DO UPDATE SET last_assigned_user_id = EXCLUDED.last_assigned_user_id, updated_at = now();
  END IF;

  RETURN next_user;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_numbers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates;
ALTER TABLE public.whatsapp_numbers REPLICA IDENTITY FULL;
ALTER TABLE public.queue_entries REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_templates REPLICA IDENTITY FULL;