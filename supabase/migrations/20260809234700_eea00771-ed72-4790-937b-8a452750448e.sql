DO $$ BEGIN
  CREATE TYPE public.workspace_mode AS ENUM ('individual','shared');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS workspace_mode public.workspace_mode NOT NULL DEFAULT 'individual';

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_new_leads boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_numbers
  ADD COLUMN IF NOT EXISTS connection_scope text NOT NULL DEFAULT 'agent';

DO $$ BEGIN
  ALTER TABLE public.whatsapp_numbers
    ADD CONSTRAINT whatsapp_numbers_connection_scope_check
    CHECK (connection_scope IN ('agent','workspace'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.workspace_mode_of(_workspace_id uuid)
RETURNS public.workspace_mode
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_mode FROM public.workspaces WHERE id = _workspace_id
$$;

-- Conexões compartilhadas precisam ser legíveis por todos os membros (envio via RLS do usuário)
DROP POLICY IF EXISTS "members read shared workspace numbers" ON public.whatsapp_numbers;
CREATE POLICY "members read shared workspace numbers"
ON public.whatsapp_numbers FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) AND connection_scope = 'workspace');

-- Histórico de transferências
CREATE TABLE IF NOT EXISTS public.conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conversation_assignments TO authenticated;
GRANT ALL ON public.conversation_assignments TO service_role;
ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read conversation assignments" ON public.conversation_assignments;
CREATE POLICY "read conversation assignments"
ON public.conversation_assignments FOR SELECT TO authenticated
USING (
  public.is_workspace_member(workspace_id, auth.uid())
  AND (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR from_user_id = auth.uid()
    OR to_user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_conversation_assignments_conv
  ON public.conversation_assignments (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_ws_assigned_last
  ON public.conversations (workspace_id, assigned_to, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ws_owner
  ON public.leads (workspace_id, owner_id);

-- Round robin atômico e ciente do modo do workspace
CREATE OR REPLACE FUNCTION public.assign_next_agent(_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  next_user UUID;
  last_user UUID;
  _mode public.workspace_mode;
BEGIN
  SELECT workspace_mode INTO _mode FROM public.workspaces WHERE id = _workspace_id;

  INSERT INTO public.queue_settings (workspace_id)
  VALUES (_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  -- lock do cursor: impede corrida entre webhooks simultâneos
  SELECT last_assigned_user_id INTO last_user
  FROM public.queue_settings
  WHERE workspace_id = _workspace_id
  FOR UPDATE;

  SELECT user_id INTO next_user
  FROM public.workspace_members wm
  WHERE wm.workspace_id = _workspace_id
    AND (
      _mode IS DISTINCT FROM 'shared'
      OR (wm.role NOT IN ('owner','admin') AND wm.is_active AND wm.accepts_new_leads)
    )
    AND (last_user IS NULL OR wm.user_id > last_user)
  ORDER BY wm.user_id
  LIMIT 1;

  IF next_user IS NULL THEN
    SELECT user_id INTO next_user
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND (
        _mode IS DISTINCT FROM 'shared'
        OR (wm.role NOT IN ('owner','admin') AND wm.is_active AND wm.accepts_new_leads)
      )
    ORDER BY wm.user_id
    LIMIT 1;
  END IF;

  IF next_user IS NOT NULL THEN
    UPDATE public.queue_settings
      SET last_assigned_user_id = next_user, updated_at = now()
    WHERE workspace_id = _workspace_id;
  END IF;

  RETURN next_user;
END;
$function$;

-- Auto-atribuição: em shared ignora dono do número e usa round robin
CREATE OR REPLACE FUNCTION public.tg_conversation_autoassign()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  wa_owner UUID;
  _mode public.workspace_mode;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    SELECT workspace_mode INTO _mode FROM public.workspaces WHERE id = NEW.workspace_id;

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
  RETURN NEW;
END $function$;

-- Lead segue o responsável da conversa (fonte única de verdade)
CREATE OR REPLACE FUNCTION public.tg_conversation_sync_lead_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.lead_id IS NOT NULL
     AND NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    UPDATE public.leads SET owner_id = NEW.assigned_to
    WHERE id = NEW.lead_id AND owner_id IS DISTINCT FROM NEW.assigned_to;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_conv_sync_lead_owner ON public.conversations;
CREATE TRIGGER trg_conv_sync_lead_owner
AFTER UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_sync_lead_owner();

-- Transferência de conversa (somente admin/owner do workspace)
CREATE OR REPLACE FUNCTION public.transfer_conversation(_conversation_id uuid, _to_user uuid, _reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _ws uuid;
  _from uuid;
  _lead uuid;
BEGIN
  SELECT workspace_id, assigned_to, lead_id INTO _ws, _from, _lead
  FROM public.conversations WHERE id = _conversation_id;

  IF _ws IS NULL THEN RAISE EXCEPTION 'Conversa não encontrada'; END IF;

  IF NOT public.is_workspace_admin(_ws, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas owner/admin pode transferir conversas' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = _to_user) THEN
    RAISE EXCEPTION 'Usuário destino não pertence ao workspace';
  END IF;

  IF _from IS NOT DISTINCT FROM _to_user THEN
    RETURN _to_user;
  END IF;

  UPDATE public.conversations SET assigned_to = _to_user, updated_at = now()
  WHERE id = _conversation_id;

  IF _lead IS NOT NULL THEN
    UPDATE public.leads SET owner_id = _to_user WHERE id = _lead;
  END IF;

  INSERT INTO public.conversation_assignments (workspace_id, conversation_id, from_user_id, to_user_id, reason, assigned_by)
  VALUES (_ws, _conversation_id, _from, _to_user, _reason, auth.uid());

  RETURN _to_user;
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_conversation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_mode_of(uuid) TO authenticated;

-- Criação de workspace com modo (aditiva; a função antiga continua existindo)
CREATE OR REPLACE FUNCTION public.create_workspace_with_mode(_name text, _slug text, _user_id uuid, _mode text DEFAULT 'individual')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $function$
DECLARE _id uuid;
BEGIN
  _id := private.create_workspace_with_defaults(_name, _slug, _user_id);
  IF _mode = 'shared' THEN
    UPDATE public.workspaces SET workspace_mode = 'shared' WHERE id = _id;
  END IF;
  RETURN _id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_workspace_with_mode(text, text, uuid, text) TO authenticated;

-- Alteração de modo só com workspace vazio
CREATE OR REPLACE FUNCTION public.set_workspace_mode(_workspace_id uuid, _mode text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT public.is_workspace_admin(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas owner/admin pode alterar o modo do workspace' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('individual','shared') THEN
    RAISE EXCEPTION 'Modo inválido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conversations WHERE workspace_id = _workspace_id)
     OR EXISTS (SELECT 1 FROM public.leads WHERE workspace_id = _workspace_id)
     OR EXISTS (SELECT 1 FROM public.whatsapp_numbers WHERE workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'Workspace já possui dados (conversas, leads ou WhatsApp). Alteração de modo exige migração específica.';
  END IF;
  UPDATE public.workspaces SET workspace_mode = _mode::public.workspace_mode WHERE id = _workspace_id;
  RETURN _mode;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_workspace_mode(uuid, text) TO authenticated;