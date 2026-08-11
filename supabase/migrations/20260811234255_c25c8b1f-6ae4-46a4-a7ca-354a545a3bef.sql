-- ============ PART A: INVENTORY ============
DO $$ BEGIN
  CREATE TYPE public.vehicle_status AS ENUM ('available','reserved','sold','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stock_code text,
  brand text NOT NULL,
  model text NOT NULL,
  version text,
  year_manufacture integer,
  year_model integer,
  mileage integer,
  price numeric(14,2),
  plate text,
  renavam text,
  chassis text,
  fuel text,
  transmission text,
  color text,
  engine text,
  category text,
  description text,
  status public.vehicle_status NOT NULL DEFAULT 'available',
  featured boolean NOT NULL DEFAULT false,
  reserved_for_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  sold_to_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  reserved_at timestamptz,
  sold_at timestamptz,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_ws_stock_code_uq ON public.vehicles (workspace_id, stock_code) WHERE stock_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS vehicles_ws_status_idx ON public.vehicles (workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vehicles_ws_brand_model_idx ON public.vehicles (workspace_id, brand, model);
CREATE INDEX IF NOT EXISTS vehicles_ws_price_idx ON public.vehicles (workspace_id, price);
CREATE INDEX IF NOT EXISTS vehicles_ws_year_idx ON public.vehicles (workspace_id, year_model);
CREATE INDEX IF NOT EXISTS vehicles_ws_created_idx ON public.vehicles (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vehicles_plate_idx ON public.vehicles (workspace_id, plate) WHERE plate IS NOT NULL;

CREATE POLICY "vehicles_select_members" ON public.vehicles FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "vehicles_insert_members" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "vehicles_update_members" ON public.vehicles FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "vehicles_delete_admins" ON public.vehicles FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.vehicle_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  sort_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_media TO authenticated;
GRANT ALL ON public.vehicle_media TO service_role;
ALTER TABLE public.vehicle_media ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS vehicle_media_vehicle_idx ON public.vehicle_media (vehicle_id, sort_order);

CREATE POLICY "vehicle_media_all_members" ON public.vehicle_media FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.lead_vehicle_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  interest_type text NOT NULL DEFAULT 'primary',
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, vehicle_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_vehicle_interests TO authenticated;
GRANT ALL ON public.lead_vehicle_interests TO service_role;
ALTER TABLE public.lead_vehicle_interests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS lvi_vehicle_idx ON public.lead_vehicle_interests (vehicle_id, status);
CREATE INDEX IF NOT EXISTS lvi_lead_idx ON public.lead_vehicle_interests (lead_id);

CREATE POLICY "lvi_all_members" ON public.lead_vehicle_interests FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_lvi_updated BEFORE UPDATE ON public.lead_vehicle_interests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ EVENT BUS ============
CREATE TABLE IF NOT EXISTS public.crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origin_event_id uuid,
  depth integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_events TO authenticated;
GRANT ALL ON public.crm_events TO service_role;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS crm_events_ws_type_idx ON public.crm_events (workspace_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_events_pending_idx ON public.crm_events (status, created_at) WHERE status = 'pending';
CREATE POLICY "crm_events_select_admins" ON public.crm_events FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- emissor de eventos de veículo (domain service no banco)
CREATE OR REPLACE FUNCTION public.tg_vehicles_emit_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.workspace_id, 'vehicle.created', 'vehicle', NEW.id,
            jsonb_build_object('status', NEW.status, 'brand', NEW.brand, 'model', NEW.model), auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.workspace_id, 'vehicle.status_changed', 'vehicle', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status), auth.uid());
    IF NEW.status = 'reserved' THEN
      INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
      VALUES (NEW.workspace_id, 'vehicle.reserved', 'vehicle', NEW.id,
              jsonb_build_object('lead_id', NEW.reserved_for_lead_id), auth.uid());
    ELSIF NEW.status = 'sold' THEN
      INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
      VALUES (NEW.workspace_id, 'vehicle.sold', 'vehicle', NEW.id,
              jsonb_build_object('lead_id', NEW.sold_to_lead_id), auth.uid());
    END IF;
  ELSE
    INSERT INTO public.crm_events (workspace_id, event_type, entity_type, entity_id, payload, actor_user_id)
    VALUES (NEW.workspace_id, 'vehicle.updated', 'vehicle', NEW.id, '{}'::jsonb, auth.uid());
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_vehicles_emit_events AFTER INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicles_emit_events();

-- carimbo automático de reserved_at / sold_at
CREATE OR REPLACE FUNCTION public.tg_vehicles_status_stamps()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'reserved' AND NEW.reserved_at IS NULL THEN NEW.reserved_at := now(); END IF;
    IF NEW.status = 'sold' AND NEW.sold_at IS NULL THEN NEW.sold_at := now(); END IF;
    IF NEW.status = 'available' THEN NEW.reserved_at := NULL; NEW.sold_at := NULL; NEW.reserved_for_lead_id := NULL; NEW.sold_to_lead_id := NULL; END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_vehicles_status_stamps BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicles_status_stamps();

-- código de estoque amigável
CREATE SEQUENCE IF NOT EXISTS public.vehicle_stock_seq;
CREATE OR REPLACE FUNCTION public.tg_vehicles_stock_code()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.stock_code IS NULL OR trim(NEW.stock_code) = '' THEN
    NEW.stock_code := 'EST-' || lpad(nextval('public.vehicle_stock_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_vehicles_stock_code BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicles_stock_code();

ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;

-- ============ PART B: AUTOMATION STUDIO (BETA) ============
CREATE TABLE IF NOT EXISTS public.automation_beta_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_beta_users TO authenticated;
GRANT ALL ON public.automation_beta_users TO service_role;
ALTER TABLE public.automation_beta_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aba_select_self" ON public.automation_beta_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_automation_beta(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.automation_beta_users WHERE user_id = _user_id AND enabled)
$fn$;

-- bootstrap allowlist a partir do e-mail (identidade técnica persistida como UUID)
INSERT INTO public.automation_beta_users (user_id)
SELECT id FROM auth.users WHERE lower(email) IN ('miguelgomes2p@gmail.com','tj1605123@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET enabled = true;

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  trigger_type text,
  draft_definition jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  published_version integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  trigger_type text,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, version)
);

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  event_id uuid,
  idempotency_key text,
  entity_type text,
  entity_id uuid,
  mode text NOT NULL DEFAULT 'live',
  status text NOT NULL DEFAULT 'running',
  depth integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.automation_execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_type text NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  resume_node_id text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automations_ws_idx ON public.automations (workspace_id, status);
CREATE INDEX IF NOT EXISTS automation_exec_ws_idx ON public.automation_executions (workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS automation_exec_auto_idx ON public.automation_executions (automation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS automation_steps_exec_idx ON public.automation_execution_steps (execution_id, seq);
CREATE INDEX IF NOT EXISTS automation_jobs_due_idx ON public.automation_jobs (status, run_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT SELECT ON public.automation_versions TO authenticated;
GRANT SELECT ON public.automation_executions TO authenticated;
GRANT SELECT ON public.automation_execution_steps TO authenticated;
GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automations, public.automation_versions, public.automation_executions,
  public.automation_execution_steps, public.automation_jobs TO service_role;

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automations_beta_all" ON public.automations FOR ALL TO authenticated
  USING (public.has_automation_beta(auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.has_automation_beta(auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "automation_versions_beta_read" ON public.automation_versions FOR SELECT TO authenticated
  USING (public.has_automation_beta(auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "automation_exec_beta_read" ON public.automation_executions FOR SELECT TO authenticated
  USING (public.has_automation_beta(auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "automation_steps_beta_read" ON public.automation_execution_steps FOR SELECT TO authenticated
  USING (public.has_automation_beta(auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "automation_jobs_beta_read" ON public.automation_jobs FOR SELECT TO authenticated
  USING (public.has_automation_beta(auth.uid()) AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_automations_updated BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_automation_jobs_updated BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();