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

  IF NEW.assigned_to IS NULL THEN
    IF _mode IS DISTINCT FROM 'shared' AND NEW.whatsapp_number_id IS NOT NULL THEN
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

DO $$
DECLARE r RECORD; _agent UUID;
BEGIN
  FOR r IN SELECT id, workspace_id, lead_id, contact_id FROM public.conversations WHERE assigned_to IS NULL LOOP
    _agent := public.assign_next_agent(r.workspace_id);
    IF _agent IS NOT NULL THEN
      UPDATE public.conversations
        SET assigned_to = _agent, assignment_status = 'assigned', updated_at = now()
      WHERE id = r.id;
      INSERT INTO public.conversation_assignments (workspace_id, conversation_id, from_user_id, to_user_id, reason, assigned_by)
      VALUES (r.workspace_id, r.id, NULL, _agent, 'backfill:round_robin', NULL);
    END IF;
  END LOOP;
END $$;