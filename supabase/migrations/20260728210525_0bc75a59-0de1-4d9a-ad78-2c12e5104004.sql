
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages
  WHERE created_at < now() - interval '45 days';
END;
$$;

-- Remove agendamento anterior (se existir) e reagenda para 03:15 UTC diariamente.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'purge_old_messages_daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
  PERFORM cron.schedule(
    'purge_old_messages_daily',
    '15 3 * * *',
    $cron$SELECT public.purge_old_messages();$cron$
  );
END $$;
