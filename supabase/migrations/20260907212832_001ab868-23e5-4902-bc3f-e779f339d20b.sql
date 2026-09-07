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

  -- Workspaces compartilhados: a atribuicao e feita pela triagem (round robin).
  IF _mode = 'shared' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.assignment_status := 'assigned';
    ELSE
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
  ELSE
    NEW.assignment_status := 'unassigned';
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.complete_triage_and_assign(_conversation_id uuid, _ai_summary text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
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
  _phone TEXT;
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

  IF _idempotency_key IS NOT NULL AND _conv.triage_idempotency_key = _idempotency_key
     AND _conv.assigned_to IS NOT NULL THEN
    SELECT p.full_name, u.phone INTO _name, _phone
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = _conv.assigned_to;
    RETURN jsonb_build_object('success', true, 'status', 'already_assigned',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id,
      'assigned_agent', jsonb_build_object('id', _conv.assigned_to, 'name', _name, 'phone', _phone));
  END IF;

  IF _conv.assigned_to IS NOT NULL THEN
    UPDATE public.conversations
      SET qualification_status = 'completed', assignment_status = 'assigned',
          triage_idempotency_key = COALESCE(_idempotency_key, triage_idempotency_key),
          updated_at = now()
    WHERE id = _conversation_id;
    SELECT p.full_name, u.phone INTO _name, _phone
    FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = _conv.assigned_to;
    RETURN jsonb_build_object('success', true, 'status', 'already_assigned',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id,
      'assigned_agent', jsonb_build_object('id', _conv.assigned_to, 'name', _name, 'phone', _phone));
  END IF;

  UPDATE public.conversations
    SET qualification_status = 'completed', assignment_status = 'ready',
        triage_idempotency_key = COALESCE(_idempotency_key, triage_idempotency_key),
        updated_at = now()
  WHERE id = _conversation_id;

  INSERT INTO public.queue_settings (workspace_id) VALUES (_conv.workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  SELECT last_assigned_user_id INTO _last
  FROM public.queue_settings WHERE workspace_id = _conv.workspace_id FOR UPDATE;

  SELECT wm.user_id INTO _agent
  FROM public.workspace_members wm
  WHERE wm.workspace_id = _conv.workspace_id
    AND wm.role NOT IN ('owner','admin','support')
    AND wm.is_active
    AND wm.accepts_new_leads
    AND (_last IS NULL OR wm.user_id > _last)
  ORDER BY wm.user_id
  LIMIT 1;

  IF _agent IS NULL THEN
    SELECT wm.user_id INTO _agent
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _conv.workspace_id
      AND wm.role NOT IN ('owner','admin','support')
      AND wm.is_active
      AND wm.accepts_new_leads
    ORDER BY wm.user_id
    LIMIT 1;
  END IF;

  IF _agent IS NULL THEN
    RETURN jsonb_build_object('success', true, 'status', 'waiting_for_agent',
      'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id);
  END IF;

  UPDATE public.conversations
    SET assigned_to = _agent, assignment_status = 'assigned', updated_at = now()
  WHERE id = _conversation_id;

  UPDATE public.queue_settings
    SET last_assigned_user_id = _agent, updated_at = now()
  WHERE workspace_id = _conv.workspace_id;

  IF _conv.lead_id IS NOT NULL THEN
    UPDATE public.leads SET owner_id = _agent WHERE id = _conv.lead_id;
  END IF;

  IF _conv.contact_id IS NOT NULL THEN
    UPDATE public.contacts SET owner_id = _agent WHERE id = _conv.contact_id AND owner_id IS NULL;
  END IF;

  INSERT INTO public.conversation_assignments (workspace_id, conversation_id, from_user_id, to_user_id, reason, assigned_by)
  VALUES (_conv.workspace_id, _conversation_id, NULL, _agent, 'triage_completed:round_robin', NULL);

  SELECT p.full_name, u.phone INTO _name, _phone
  FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = _agent;

  RETURN jsonb_build_object('success', true, 'status', 'assigned',
    'conversation_id', _conversation_id, 'workspace_id', _conv.workspace_id,
    'assigned_agent', jsonb_build_object('id', _agent, 'name', _name, 'phone', _phone));
END $function$;