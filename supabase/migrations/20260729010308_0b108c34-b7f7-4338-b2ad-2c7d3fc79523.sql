
-- 1) Extend stage_automations
ALTER TABLE public.stage_automations
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'stage_enter',
  ADD COLUMN IF NOT EXISTS interval_seconds integer,
  ADD COLUMN IF NOT EXISTS max_runs integer;

ALTER TABLE public.stage_automations
  DROP CONSTRAINT IF EXISTS stage_automations_trigger_type_chk;
ALTER TABLE public.stage_automations
  ADD CONSTRAINT stage_automations_trigger_type_chk
  CHECK (trigger_type IN ('stage_enter','recurring'));

-- 2) New table: runs (per lead x automation)
CREATE TABLE IF NOT EXISTS public.stage_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  automation_id uuid NOT NULL REFERENCES public.stage_automations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL,
  runs_count integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_automation_runs_status_chk CHECK (status IN ('active','completed','cancelled','failed')),
  CONSTRAINT stage_automation_runs_unique UNIQUE (automation_id, lead_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_automation_runs TO authenticated;
GRANT ALL ON public.stage_automation_runs TO service_role;

ALTER TABLE public.stage_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sar_select_ws_members" ON public.stage_automation_runs
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "sar_write_ws_admins" ON public.stage_automation_runs
  FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS sar_due_idx ON public.stage_automation_runs (next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS sar_lead_idx ON public.stage_automation_runs (lead_id);

DROP TRIGGER IF EXISTS trg_sar_updated_at ON public.stage_automation_runs;
CREATE TRIGGER trg_sar_updated_at BEFORE UPDATE ON public.stage_automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Trigger on leads: cancel runs when lead leaves a stage
CREATE OR REPLACE FUNCTION public.tg_leads_cancel_stage_automation_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    UPDATE public.stage_automation_runs
      SET status = 'cancelled', updated_at = now()
    WHERE lead_id = NEW.id
      AND stage_id = OLD.stage_id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_cancel_sar ON public.leads;
CREATE TRIGGER trg_leads_cancel_sar
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leads_cancel_stage_automation_runs();

-- 4) Cron job: run recurring follow-ups every minute
DO $$
DECLARE
  jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'run-recurring-automations-1m';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'run-recurring-automations-1m',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/run-recurring-automations',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
