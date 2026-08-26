-- 1) Feature flag por workspace (rollback simples)
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean NOT NULL DEFAULT false;

-- 2) Dispositivos (subscriptions)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_label text,
  user_agent text,
  enabled boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_push_subs_ws ON public.push_subscriptions(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_push_subs_updated BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Fila de eventos push (idempotente por dedupe_key)
CREATE TABLE IF NOT EXISTS public.push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id uuid,
  event_type text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_queue_pending ON public.push_queue(created_at) WHERE status = 'pending';

GRANT ALL ON public.push_queue TO service_role;
ALTER TABLE public.push_queue ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated/anon: fila é exclusivamente do servidor.

CREATE TRIGGER trg_push_queue_updated BEFORE UPDATE ON public.push_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Disparo assíncrono best-effort do drenador
CREATE OR REPLACE FUNCTION public.tg_push_queue_drain_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://crm.lupusassessoria.com/api/public/hooks/drain-push',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- push nunca pode quebrar o fluxo principal
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_push_queue_drain
  AFTER INSERT ON public.push_queue
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.tg_push_queue_drain_now();

-- 5) Enfileira push de mensagem recebida do cliente (nunca outbound/IA/sistema)
CREATE OR REPLACE FUNCTION public.tg_push_on_customer_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _agent uuid;
  _ws uuid;
  _enabled boolean;
  _name text;
  _preview text;
BEGIN
  IF NEW.direction <> 'inbound' OR NEW.sender_type <> 'contact' THEN
    RETURN NULL;
  END IF;

  SELECT c.assigned_to, c.workspace_id, COALESCE(ct.name, c.subject, 'Contato')
    INTO _agent, _ws, _name
  FROM public.conversations c
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.id = NEW.conversation_id;

  IF _agent IS NULL OR _ws IS NULL THEN RETURN NULL; END IF;

  SELECT push_notifications_enabled INTO _enabled FROM public.workspaces WHERE id = _ws;
  IF _enabled IS NOT TRUE THEN RETURN NULL; END IF;

  _preview := COALESCE(NULLIF(trim(NEW.content), ''), CASE NEW.media_type
    WHEN 'image' THEN '📷 Imagem'
    WHEN 'audio' THEN '🎵 Áudio'
    WHEN 'video' THEN '🎬 Vídeo'
    WHEN 'document' THEN '📎 Documento'
    WHEN 'location' THEN '📍 Localização'
    ELSE 'Nova mensagem' END);

  INSERT INTO public.push_queue (workspace_id, user_id, conversation_id, event_type, dedupe_key, title, body)
  VALUES (_ws, _agent, NEW.conversation_id, 'NEW_CUSTOMER_MESSAGE',
          'msg:' || NEW.id::text || ':' || _agent::text,
          '💬 Nova mensagem de ' || _name,
          left(_preview, 120))
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_push_on_customer_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_push_on_customer_message();

-- 6) Enfileira push de lead atribuído (apenas reage ao resultado do Round Robin)
CREATE OR REPLACE FUNCTION public.tg_push_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enabled boolean;
  _name text;
  _vehicle text;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NULL;
  END IF;

  SELECT push_notifications_enabled INTO _enabled FROM public.workspaces WHERE id = NEW.workspace_id;
  IF _enabled IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT COALESCE(ct.name, NEW.subject, 'Novo contato') INTO _name
  FROM public.contacts ct WHERE ct.id = NEW.contact_id;
  _name := COALESCE(_name, NEW.subject, 'Novo contato');

  IF NEW.lead_id IS NOT NULL THEN
    SELECT concat_ws(' ', v.brand, v.model) INTO _vehicle
    FROM public.lead_vehicle_interests lvi
    JOIN public.vehicles v ON v.id = lvi.vehicle_id
    WHERE lvi.lead_id = NEW.lead_id
    ORDER BY lvi.created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.push_queue (workspace_id, user_id, conversation_id, event_type, dedupe_key, title, body)
  VALUES (NEW.workspace_id, NEW.assigned_to, NEW.id, 'NEW_LEAD_ASSIGNED',
          'assign:' || NEW.id::text || ':' || NEW.assigned_to::text,
          '🚗 Novo lead atribuído',
          CASE WHEN _vehicle IS NOT NULL AND trim(_vehicle) <> ''
               THEN _name || ' tem interesse no ' || _vehicle || '.'
               ELSE _name || ' iniciou um novo atendimento.' END)
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_push_on_assignment_ins
  AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_push_on_assignment();

CREATE TRIGGER trg_push_on_assignment_upd
  AFTER UPDATE OF assigned_to ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_push_on_assignment();