
-- 1) Novas colunas em renave_config -------------------------------------------------
ALTER TABLE public.renave_config
  ADD COLUMN IF NOT EXISTS cert_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS cert_password_enc TEXT,
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT,
  ADD COLUMN IF NOT EXISTS oauth_client_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS oauth_token_cache JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estabelecimento_id_padrao TEXT;

-- 2) Policies do bucket renave-certs (path convention: <workspace_id>/cert.p12) -----
DROP POLICY IF EXISTS "renave_certs admins read"   ON storage.objects;
DROP POLICY IF EXISTS "renave_certs admins insert" ON storage.objects;
DROP POLICY IF EXISTS "renave_certs admins update" ON storage.objects;
DROP POLICY IF EXISTS "renave_certs admins delete" ON storage.objects;

CREATE POLICY "renave_certs admins read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'renave-certs'
  AND public.has_workspace_role(
    (regexp_split_to_array(name, '/'))[1]::uuid,
    auth.uid(),
    ARRAY['owner','admin']::app_role[]
  )
);

CREATE POLICY "renave_certs admins insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'renave-certs'
  AND public.has_workspace_role(
    (regexp_split_to_array(name, '/'))[1]::uuid,
    auth.uid(),
    ARRAY['owner','admin']::app_role[]
  )
);

CREATE POLICY "renave_certs admins update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'renave-certs'
  AND public.has_workspace_role(
    (regexp_split_to_array(name, '/'))[1]::uuid,
    auth.uid(),
    ARRAY['owner','admin']::app_role[]
  )
);

CREATE POLICY "renave_certs admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'renave-certs'
  AND public.has_workspace_role(
    (regexp_split_to_array(name, '/'))[1]::uuid,
    auth.uid(),
    ARRAY['owner','admin']::app_role[]
  )
);

-- 3) Cron para drenar a fila do RENAVE a cada 30s -----------------------------------
DO $$
DECLARE jid BIGINT;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'drain-renave-queue-30s';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'drain-renave-queue-30s',
  '30 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://project--3f03414f-c100-4861-aba8-30bf563c6c65.lovable.app/api/public/hooks/drain-renave-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-renave-cron-secret', current_setting('app.renave_cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
