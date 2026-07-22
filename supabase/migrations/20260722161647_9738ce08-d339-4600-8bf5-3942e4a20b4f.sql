CREATE TABLE IF NOT EXISTS public.evolution_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES public.whatsapp_numbers(id) ON DELETE SET NULL,
  operation text NOT NULL,
  method text,
  url text,
  status int,
  request_body jsonb,
  response_body text,
  error_message text,
  base_url text,
  instance_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evolution_error_logs_workspace_created_idx
  ON public.evolution_error_logs (workspace_id, created_at DESC);
GRANT SELECT, INSERT ON public.evolution_error_logs TO authenticated;
GRANT ALL ON public.evolution_error_logs TO service_role;
ALTER TABLE public.evolution_error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read evo logs" ON public.evolution_error_logs;
CREATE POLICY "members read evo logs" ON public.evolution_error_logs
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));
DROP POLICY IF EXISTS "members insert evo logs" ON public.evolution_error_logs;
CREATE POLICY "members insert evo logs" ON public.evolution_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));