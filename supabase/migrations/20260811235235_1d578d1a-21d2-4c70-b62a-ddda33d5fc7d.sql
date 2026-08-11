CREATE OR REPLACE FUNCTION public.tg_leads_emit_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.workspace_id, 'lead.created', 'lead', NEW.id,
            jsonb_build_object('stage_id', NEW.stage_id, 'source', NEW.source), auth.uid());
    RETURN NEW;
  END IF;
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.workspace_id, 'lead.stage_changed', 'lead', NEW.id,
            jsonb_build_object('from', OLD.stage_id, 'to', NEW.stage_id), auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_emit_events ON public.leads;
CREATE TRIGGER trg_leads_emit_events AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_emit_events();

CREATE OR REPLACE FUNCTION public.tg_lead_vehicle_emit_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
  VALUES (NEW.workspace_id, 'lead_vehicle.linked', 'lead', NEW.lead_id,
          jsonb_build_object('vehicle_id', NEW.vehicle_id, 'lead_id', NEW.lead_id), auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_vehicle_emit_events ON public.lead_vehicle_interests;
CREATE TRIGGER trg_lead_vehicle_emit_events AFTER INSERT ON public.lead_vehicle_interests
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_vehicle_emit_events();

CREATE INDEX IF NOT EXISTS idx_crm_events_pending ON public.crm_events (status, created_at) WHERE status = 'pending';