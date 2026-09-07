ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS is_inbox boolean NOT NULL DEFAULT false;

-- Cria a etapa "Caixa de Entrada" na primeira posição de cada pipeline que ainda não tenha uma.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT id, workspace_id FROM public.pipelines LOOP
    IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages s WHERE s.pipeline_id = p.id AND s.is_inbox) THEN
      UPDATE public.pipeline_stages SET position = position + 1 WHERE pipeline_id = p.id;
      INSERT INTO public.pipeline_stages (workspace_id, pipeline_id, name, color, type, position, is_inbox)
      VALUES (p.workspace_id, p.id, 'Caixa de Entrada', '#64748b', 'open', 0, true);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.tg_conversation_create_inbox_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_title text;
  v_lead_id uuid;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_pipeline_id
  FROM public.pipelines
  WHERE workspace_id = NEW.workspace_id
  ORDER BY position
  LIMIT 1;
  IF v_pipeline_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_stage_id
  FROM public.pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND is_inbox
  ORDER BY position
  LIMIT 1;
  IF v_stage_id IS NULL THEN RETURN NEW; END IF;

  -- Reaproveita lead já existente do contato nesta pipeline (idempotência).
  IF NEW.contact_id IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM public.leads
    WHERE workspace_id = NEW.workspace_id
      AND contact_id = NEW.contact_id
      AND pipeline_id = v_pipeline_id
      AND deleted_at IS NULL
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    SELECT COALESCE(NULLIF(c.name, ''), NEW.subject, 'Nova conversa') INTO v_title
    FROM public.contacts c WHERE c.id = NEW.contact_id;
    v_title := COALESCE(v_title, NEW.subject, 'Nova conversa');

    INSERT INTO public.leads (workspace_id, pipeline_id, stage_id, contact_id, title, source, owner_id, last_interaction_at)
    VALUES (NEW.workspace_id, v_pipeline_id, v_stage_id, NEW.contact_id, v_title,
            NEW.channel::text, NEW.assigned_to, now())
    RETURNING id INTO v_lead_id;
  END IF;

  NEW.lead_id := v_lead_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_conversation_create_inbox_lead ON public.conversations;
CREATE TRIGGER tg_conversation_create_inbox_lead
BEFORE INSERT ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_create_inbox_lead();