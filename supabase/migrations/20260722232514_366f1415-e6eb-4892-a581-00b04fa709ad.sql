
-- 1) whatsapp_numbers: restringir leitura a admins ou dono padrão
DROP POLICY IF EXISTS "members can read workspace whatsapp numbers" ON public.whatsapp_numbers;
CREATE POLICY "read own or admin whatsapp numbers" ON public.whatsapp_numbers
  FOR SELECT USING (
    is_workspace_member(workspace_id, auth.uid())
    AND (
      is_workspace_admin(workspace_id, auth.uid())
      OR default_owner_id = auth.uid()
    )
  );

-- 2) contatos: backfill owner_id a partir da conversa vinculada
UPDATE public.contacts c
SET owner_id = conv.assigned_to
FROM public.conversations conv
WHERE c.owner_id IS NULL
  AND conv.contact_id = c.id
  AND conv.assigned_to IS NOT NULL
  AND conv.workspace_id = c.workspace_id;

-- 3) Triggers ausentes (função existia sem trigger anexado)
DROP TRIGGER IF EXISTS trg_conversation_autoassign ON public.conversations;
CREATE TRIGGER trg_conversation_autoassign
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_autoassign();

DROP TRIGGER IF EXISTS trg_conversation_autotag_wa ON public.conversations;
CREATE TRIGGER trg_conversation_autotag_wa
  AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_autotag_wa();

DROP TRIGGER IF EXISTS trg_leads_default_owner ON public.leads;
CREATE TRIGGER trg_leads_default_owner
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_default_owner();

DROP TRIGGER IF EXISTS trg_contacts_default_owner ON public.contacts;
CREATE TRIGGER trg_contacts_default_owner
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_default_owner();

-- 4) contatos criados por webhook (owner_id NULL) — atribuir via round-robin quando ligados a nova conversa
-- Já resolvido acima via backfill; novos contatos criados pelo webhook antes da conversa serão atualizados quando a conversa for criada.
CREATE OR REPLACE FUNCTION public.tg_contact_sync_owner_from_conv()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
      SET owner_id = NEW.assigned_to
    WHERE id = NEW.contact_id AND owner_id IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conv_sync_contact_owner ON public.conversations;
CREATE TRIGGER trg_conv_sync_contact_owner
  AFTER INSERT OR UPDATE OF assigned_to ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_contact_sync_owner_from_conv();
