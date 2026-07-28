
DO $$
DECLARE
  merged_convs INT := 0;
  merged_contacts INT := 0;
  moved_messages INT := 0;
  moved_queue INT := 0;
BEGIN
  -- ============================================================
  -- 1) MESCLA CONVERSAS DUPLICADAS (mesmo whatsapp_number_id + wa_contact_wa_id)
  -- ============================================================
  CREATE TEMP TABLE _conv_survivors ON COMMIT DROP AS
  SELECT DISTINCT ON (whatsapp_number_id, wa_contact_wa_id)
    id AS survivor_id, whatsapp_number_id, wa_contact_wa_id
  FROM public.conversations
  WHERE whatsapp_number_id IS NOT NULL AND wa_contact_wa_id IS NOT NULL
  ORDER BY whatsapp_number_id, wa_contact_wa_id, created_at ASC, id ASC;

  CREATE TEMP TABLE _conv_dupes ON COMMIT DROP AS
  SELECT c.id AS dup_id, s.survivor_id
  FROM public.conversations c
  JOIN _conv_survivors s
    ON s.whatsapp_number_id = c.whatsapp_number_id
   AND s.wa_contact_wa_id = c.wa_contact_wa_id
  WHERE c.id <> s.survivor_id;

  SELECT count(*) INTO merged_convs FROM _conv_dupes;

  -- Move mensagens das conversas duplicadas para a sobrevivente
  WITH upd AS (
    UPDATE public.messages m
    SET conversation_id = d.survivor_id
    FROM _conv_dupes d
    WHERE m.conversation_id = d.dup_id
    RETURNING 1
  )
  SELECT count(*) INTO moved_messages FROM upd;

  -- Move queue_entries (se a tabela e coluna existirem)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='queue_entries' AND column_name='conversation_id'
  ) THEN
    -- queue_entries é transiente (UNIQUE por conversation_id). Descarta entradas das
    -- conversas duplicadas — se necessário serão recriadas no próximo evento.
    WITH del AS (
      DELETE FROM public.queue_entries q
      USING _conv_dupes d
      WHERE q.conversation_id = d.dup_id
      RETURNING 1
    )
    SELECT count(*) INTO moved_queue FROM del;
  END IF;

  -- Deleta conversas duplicadas
  DELETE FROM public.conversations c USING _conv_dupes d WHERE c.id = d.dup_id;

  -- ============================================================
  -- 2) MESCLA CONTATOS DUPLICADOS (mesmo workspace_id + phone)
  --    (rodar DEPOIS de mesclar conversas para não perder ref.)
  -- ============================================================
  CREATE TEMP TABLE _contact_survivors ON COMMIT DROP AS
  SELECT DISTINCT ON (workspace_id, phone)
    id AS survivor_id, workspace_id, phone
  FROM public.contacts
  WHERE workspace_id IS NOT NULL AND phone IS NOT NULL AND phone <> ''
  ORDER BY workspace_id, phone, created_at ASC, id ASC;

  CREATE TEMP TABLE _contact_dupes ON COMMIT DROP AS
  SELECT c.id AS dup_id, s.survivor_id
  FROM public.contacts c
  JOIN _contact_survivors s
    ON s.workspace_id = c.workspace_id
   AND s.phone = c.phone
  WHERE c.id <> s.survivor_id;

  SELECT count(*) INTO merged_contacts FROM _contact_dupes;

  -- Reatribui conversations.contact_id para o sobrevivente
  UPDATE public.conversations conv
  SET contact_id = d.survivor_id
  FROM _contact_dupes d
  WHERE conv.contact_id = d.dup_id;

  -- Reatribui messages.contact_id se existir a coluna
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages' AND column_name='contact_id'
  ) THEN
    UPDATE public.messages m
    SET contact_id = d.survivor_id
    FROM _contact_dupes d
    WHERE m.contact_id = d.dup_id;
  END IF;

  -- Deleta contatos duplicados
  DELETE FROM public.contacts c USING _contact_dupes d WHERE c.id = d.dup_id;

  -- ============================================================
  -- 3) RECALCULA last_message_at / last_message_preview
  -- ============================================================
  WITH last_msg AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.created_at,
      COALESCE(NULLIF(m.content, ''), '[mídia]') AS preview
    FROM public.messages m
    ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
  )
  UPDATE public.conversations c
  SET last_message_at = lm.created_at,
      last_message_preview = LEFT(lm.preview, 200)
  FROM last_msg lm
  WHERE c.id = lm.conversation_id;

  RAISE NOTICE 'DEDUP RESULT: merged_conversations=% merged_contacts=% moved_messages=% moved_queue=%',
    merged_convs, merged_contacts, moved_messages, moved_queue;
END $$;

-- ============================================================
-- 4) CONSTRAINTS UNIQUE (impede regressão)
-- ============================================================
DROP INDEX IF EXISTS public.idx_conversations_wa_contact;
DROP INDEX IF EXISTS public.idx_contacts_ws_phone;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_workspace_phone_unique;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_workspace_phone_unique UNIQUE (workspace_id, phone);

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_number_wa_contact_unique;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_number_wa_contact_unique UNIQUE (whatsapp_number_id, wa_contact_wa_id);
