CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notifications select" ON public.notifications;
CREATE POLICY "own notifications select" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "own notifications mark read" ON public.notifications;
CREATE POLICY "own notifications mark read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_recipient_uidx
  ON public.notifications (event_key, recipient_user_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_ws_recipient_idx
  ON public.notifications (workspace_id, recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_conversation_idx
  ON public.notifications (conversation_id);

-- Impede que o usuário altere qualquer coisa além de read_at
CREATE OR REPLACE FUNCTION public.tg_notifications_only_read_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.id := OLD.id;
  NEW.workspace_id := OLD.workspace_id;
  NEW.recipient_user_id := OLD.recipient_user_id;
  NEW.type := OLD.type;
  NEW.title := OLD.title;
  NEW.body := OLD.body;
  NEW.conversation_id := OLD.conversation_id;
  NEW.lead_id := OLD.lead_id;
  NEW.actor_user_id := OLD.actor_user_id;
  NEW.event_key := OLD.event_key;
  NEW.metadata := OLD.metadata;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_only_read_at ON public.notifications;
CREATE TRIGGER trg_notifications_only_read_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_notifications_only_read_at();

-- Notificação nasce do evento real de atribuição (conversation_assignments)
CREATE OR REPLACE FUNCTION public.tg_assignment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _type text;
  _title text;
  _customer text;
  _lead_id uuid;
  _lead_title text;
  _source text;
BEGIN
  IF NEW.to_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.to_user_id = NEW.from_user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(ct.name, c.subject, 'Novo contato'), c.lead_id
    INTO _customer, _lead_id
  FROM public.conversations c
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.id = NEW.conversation_id;

  IF _lead_id IS NOT NULL THEN
    SELECT title, source INTO _lead_title, _source FROM public.leads WHERE id = _lead_id;
  END IF;

  IF NEW.from_user_id IS NULL THEN
    _type := 'conversation_assigned';
    _title := 'Novo atendimento atribuído';
  ELSE
    _type := 'conversation_transferred';
    _title := 'Atendimento transferido para você';
  END IF;

  INSERT INTO public.notifications (
    workspace_id, recipient_user_id, type, title, body,
    conversation_id, lead_id, actor_user_id, event_key, metadata
  ) VALUES (
    NEW.workspace_id,
    NEW.to_user_id,
    _type,
    _title,
    COALESCE(_customer, 'Contato') || CASE WHEN NEW.from_user_id IS NULL
      THEN ' foi atribuído a você.' ELSE ' foi transferido para o seu atendimento.' END,
    NEW.conversation_id,
    _lead_id,
    NEW.assigned_by,
    'assignment:' || NEW.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'customer_name', _customer,
      'lead_title', _lead_title,
      'origin', _source,
      'assignment_source', COALESCE(NEW.reason, CASE WHEN NEW.from_user_id IS NULL THEN 'round_robin' ELSE 'manual_transfer' END)
    ))
  )
  ON CONFLICT (event_key, recipient_user_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assignment_notification ON public.conversation_assignments;
CREATE TRIGGER trg_assignment_notification
AFTER INSERT ON public.conversation_assignments
FOR EACH ROW EXECUTE FUNCTION public.tg_assignment_notification();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;