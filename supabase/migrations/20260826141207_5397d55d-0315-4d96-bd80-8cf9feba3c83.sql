CREATE OR REPLACE FUNCTION public.tg_push_on_customer_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _agent uuid;
  _ws uuid;
  _enabled boolean;
  _name text;
  _preview text;
  _recipient uuid;
BEGIN
  IF NEW.direction IS DISTINCT FROM 'inbound' OR NEW.sender_type IS DISTINCT FROM 'contact' THEN
    RETURN NULL;
  END IF;

  SELECT c.assigned_to, c.workspace_id, COALESCE(NULLIF(ct.name, ''), NULLIF(c.subject, ''), 'Contato')
    INTO _agent, _ws, _name
  FROM public.conversations c
  LEFT JOIN public.contacts ct ON ct.id = c.contact_id
  WHERE c.id = NEW.conversation_id;

  IF _ws IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT w.push_notifications_enabled
    INTO _enabled
  FROM public.workspaces w
  WHERE w.id = _ws;

  IF _enabled IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  _preview := COALESCE(NULLIF(trim(NEW.content), ''), CASE NEW.media_type
    WHEN 'image' THEN '📷 Imagem'
    WHEN 'audio' THEN '🎵 Áudio'
    WHEN 'video' THEN '🎬 Vídeo'
    WHEN 'document' THEN '📎 Documento'
    WHEN 'location' THEN '📍 Localização'
    ELSE 'Nova mensagem' END);

  IF _agent IS NOT NULL THEN
    INSERT INTO public.push_queue
      (workspace_id, user_id, conversation_id, event_type, dedupe_key, title, body)
    VALUES
      (_ws, _agent, NEW.conversation_id, 'NEW_CUSTOMER_MESSAGE',
       'msg:' || NEW.id::text || ':' || _agent::text,
       '💬 Nova mensagem de ' || _name, left(_preview, 120))
    ON CONFLICT (dedupe_key) DO NOTHING;
  ELSE
    FOR _recipient IN
      SELECT DISTINCT wm.user_id
      FROM public.workspace_members wm
      WHERE wm.workspace_id = _ws
        AND wm.is_active = true
        AND wm.role IN ('owner', 'admin', 'manager', 'support')
        AND EXISTS (
          SELECT 1
          FROM public.push_subscriptions ps
          WHERE ps.workspace_id = _ws
            AND ps.user_id = wm.user_id
            AND ps.enabled = true
        )
    LOOP
      INSERT INTO public.push_queue
        (workspace_id, user_id, conversation_id, event_type, dedupe_key, title, body)
      VALUES
        (_ws, _recipient, NEW.conversation_id, 'NEW_CUSTOMER_MESSAGE',
         'msg:' || NEW.id::text || ':' || _recipient::text,
         '💬 Nova mensagem de ' || _name, left(_preview, 120))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push enqueue failed for message %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_push_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.push_queue
  SET status = 'pending', error = NULL
  WHERE status = 'processing'
    AND updated_at < now() - interval '5 minutes'
    AND attempts < 4;

  UPDATE public.push_queue
  SET status = 'pending', error = NULL
  WHERE status = 'failed'
    AND attempts < 4
    AND updated_at < now() - interval '1 minute';

  IF EXISTS (SELECT 1 FROM public.push_queue WHERE status = 'pending') THEN
    PERFORM net.http_post(
      url := 'https://crm.lupusassessoria.com/api/public/hooks/drain-push',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push queue retry failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_push_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_push_queue() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-push-queue') THEN
    PERFORM cron.unschedule('retry-push-queue');
  END IF;
  PERFORM cron.schedule(
    'retry-push-queue',
    '* * * * *',
    'SELECT public.retry_push_queue();'
  );
END;
$$;