
-- Auto-atribui conversas ao dono do número de WhatsApp que recebeu a mensagem.
-- Fallback: rodízio entre membros apenas se o número não tiver dono definido.
CREATE OR REPLACE FUNCTION public.tg_conversation_autoassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  wa_owner UUID;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    IF NEW.whatsapp_number_id IS NOT NULL THEN
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

-- Backfill: realoca conversas existentes para o dono do número correspondente.
UPDATE public.conversations c
SET assigned_to = w.default_owner_id
FROM public.whatsapp_numbers w
WHERE c.whatsapp_number_id = w.id
  AND w.default_owner_id IS NOT NULL
  AND c.assigned_to IS DISTINCT FROM w.default_owner_id;

-- Sincroniza o dono dos contatos vinculados.
UPDATE public.contacts ct
SET owner_id = c.assigned_to
FROM public.conversations c
WHERE ct.id = c.contact_id
  AND c.assigned_to IS NOT NULL
  AND ct.owner_id IS DISTINCT FROM c.assigned_to;
