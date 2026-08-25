CREATE TABLE public.contact_birthday_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  year integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, year)
);

GRANT SELECT ON public.contact_birthday_sends TO authenticated;
GRANT ALL ON public.contact_birthday_sends TO service_role;

ALTER TABLE public.contact_birthday_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view birthday sends"
ON public.contact_birthday_sends FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX idx_contact_birthday_sends_ws_year ON public.contact_birthday_sends (workspace_id, year);
CREATE INDEX idx_contacts_birthdate_md ON public.contacts (
  (EXTRACT(MONTH FROM birthdate)), (EXTRACT(DAY FROM birthdate))
) WHERE birthdate IS NOT NULL;

SELECT cron.schedule(
  'run-birthday-automations-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://crm.lupusassessoria.com/api/public/hooks/run-birthday-automations',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_79PiwKvQen0ESeYmm_nPSA_f8D4mNil"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);