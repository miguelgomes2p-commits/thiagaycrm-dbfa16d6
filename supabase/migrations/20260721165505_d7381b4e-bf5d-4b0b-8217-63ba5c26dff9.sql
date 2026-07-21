-- Backfill whatsapp_number_id for whatsapp conversations that lost their link.
-- For each workspace with exactly one connected evolution number, assign it to null-linked whatsapp conversations.
UPDATE public.conversations c
SET whatsapp_number_id = w.id
FROM public.whatsapp_numbers w
WHERE c.channel = 'whatsapp'
  AND c.whatsapp_number_id IS NULL
  AND w.workspace_id = c.workspace_id
  AND w.connection_status = 'connected'
  AND (
    SELECT count(*) FROM public.whatsapp_numbers w2
    WHERE w2.workspace_id = c.workspace_id AND w2.connection_status = 'connected'
  ) = 1;

-- Also backfill wa_contact_wa_id from contact.phone when missing
UPDATE public.conversations c
SET wa_contact_wa_id = ct.phone
FROM public.contacts ct
WHERE c.contact_id = ct.id
  AND c.channel = 'whatsapp'
  AND c.wa_contact_wa_id IS NULL
  AND ct.phone IS NOT NULL;