
CREATE TABLE public.stage_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Automação',
  action_type TEXT NOT NULL DEFAULT 'send_whatsapp',
  message TEXT,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stage_automations_stage ON public.stage_automations(stage_id) WHERE active = true;
CREATE INDEX idx_stage_automations_workspace ON public.stage_automations(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_automations TO authenticated;
GRANT ALL ON public.stage_automations TO service_role;

ALTER TABLE public.stage_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace automations"
  ON public.stage_automations FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Admins manage automations"
  ON public.stage_automations FOR ALL
  TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE TRIGGER trg_stage_automations_updated_at
  BEFORE UPDATE ON public.stage_automations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
