ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS qualification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS triage_idempotency_key TEXT;

UPDATE public.conversations SET assignment_status = 'assigned' WHERE assigned_to IS NOT NULL AND assignment_status <> 'assigned';

CREATE OR REPLACE FUNCTION public.tg_conversation_autoassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  wa_owner UUID;
  _mode public.workspace_mode;
BEGIN
  SELECT workspace_mode INTO _mode FROM public.workspaces WHERE id = NEW.workspace_id;

  -- Modo compartilhado: a distribuicao acontece somente apos a triagem da IA.
  IF _mode = 'shared' THEN
    IF NEW.assigned_to IS NULL THEN
      NEW.assignment_status := 'unassigned';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    IF NEW.whatsapp_number_id IS NOT NULL THEN
      SELECT default_owner_id INTO wa_owner
      FROM public.whatsapp_numbers
      WHERE id = NEW.whatsapp_number_id;
    END IF;

    IF wa_owner IS NOT NULL THEN
      NEW.assigned_to := wa_owner;
    ELSE
      NEW.assigned_to := public.assign_next_agent(NEW.workspace_id);
    END IF;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    NEW.assignment_status := 'assigned';
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.complete_triage_and_assign(
  _conversation_id UUID,
  _ai_summary TEXT DEFAULT NULL,
  _idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _conv RECORD;
  _mode public.workspace_mode;
  _agent UUID;
  _last UUID;
  _name TEXT;
BEGIN
  SELECT * INTO _conv FROM public.conversations WHERE id = _conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'conversation_not_found');
  END IF;

  SELECT workspace_mode INTO _mode FROM public.workspaces WHERE id = _conv.workspace_id;

  IF _ai_summary IS NOT NULL AND length(trim(_ai_summary)) > 0 THEN
    UPDATE public.conversations SET ai_summary = _ai_summary WHERE id = _conversation_id;
  END IF;

  IF _mode IS DISTINCT FROM 'shared' THEN
    UPDATE public.conversations
      SET qualification_status = 'completed', updated_at = now()
    WHERE id = _conversation_id;
    RETURN jsonb_build_object('success', false, 'status', 'workspace_not_shared',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id);
  END IF;

  -- Idempotencia por chave (retry do n8n com a mesma Idempotency-Key)
  IF _idempotency_key IS NOT NULL AND _conv.triage_idempotency_key = _idempotency_key
     AND _conv.assigned_to IS NOT NULL THEN
    SELECT full_name INTO _name FROM public.profiles WHERE id = _conv.assigned_to;
    RETURN jsonb_build_object('success', true, 'status', 'already_assigned',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id,
      'assigned_agent', jsonb_build_object('id', _conv.assigned_to, 'name', _name));
  END IF;

  -- Idempotencia principal: ja possui responsavel
  IF _conv.assigned_to IS NOT NULL THEN
    UPDATE public.conversations
      SET qualification_status = 'completed', assignment_status = 'assigned',
          triage_idempotency_key = COALESCE(_idempotency_key, triage_idempotency_key),
          updated_at = now()
    WHERE id = _conversation_id;
    SELECT full_name INTO _name FROM public.profiles WHERE id = _conv.assigned_to;
    RETURN jsonb_build_object('success', true, 'status', 'already_assigned',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id,
      'assigned_agent', jsonb_build_object('id', _conv.assigned_to, 'name', _name));
  END IF;

  UPDATE public.conversations
    SET qualification_status = 'completed', assignment_status = 'ready',
        triage_idempotency_key = COALESCE(_idempotency_key, triage_idempotency_key),
        updated_at = now()
  WHERE id = _conversation_id;

  INSERT INTO public.queue_settings (workspace_id) VALUES (_conv.workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  -- Lock do cursor: garante round robin atomico entre chamadas concorrentes
  SELECT last_assigned_user_id INTO _last
  FROM public.queue_settings WHERE workspace_id = _conv.workspace_id FOR UPDATE;

  SELECT wm.user_id INTO _agent
  FROM public.workspace_members wm
  WHERE wm.workspace_id = _conv.workspace_id
    AND wm.role NOT IN ('owner','admin')
    AND wm.is_active
    AND wm.accepts_new_leads
    AND (_last IS NULL OR wm.user_id > _last)
  ORDER BY wm.user_id
  LIMIT 1;

  IF _agent IS NULL THEN
    SELECT wm.user_id INTO _agent
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _conv.workspace_id
      AND wm.role NOT IN ('owner','admin')
      AND wm.is_active
      AND wm.accepts_new_leads
    ORDER BY wm.user_id
    LIMIT 1;
  END IF;

  IF _agent IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_for_agent',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id);
  END IF;

  UPDATE public.queue_settings
    SET last_assigned_user_id = _agent, updated_at = now()
  WHERE workspace_id = _conv.workspace_id;

  UPDATE public.conversations
    SET assigned_to = _agent, assignment_status = 'assigned', updated_at = now()
  WHERE id = _conversation_id;

  IF _conv.lead_id IS NOT NULL THEN
    UPDATE public.leads SET owner_id = _agent WHERE id = _conv.lead_id;
  END IF;

  IF _conv.contact_id IS NOT NULL THEN
    UPDATE public.contacts SET owner_id = _agent WHERE id = _conv.contact_id AND owner_id IS NULL;
  END IF;

  INSERT INTO public.conversation_assignments (workspace_id, conversation_id, from_user_id, to_user_id, reason, assigned_by)
  VALUES (_conv.workspace_id, _conversation_id, NULL, _agent, 'triage_completed:round_robin', NULL);

  SELECT full_name INTO _name FROM public.profiles WHERE id = _agent;

  RETURN jsonb_build_object('success', true, 'status', 'assigned',
    'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id,
    'assigned_agent', jsonb_build_object('id', _agent, 'name', _name));
END $function$;

REVOKE ALL ON FUNCTION public.complete_triage_and_assign(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_triage_and_assign(UUID, TEXT, TEXT) TO service_role;