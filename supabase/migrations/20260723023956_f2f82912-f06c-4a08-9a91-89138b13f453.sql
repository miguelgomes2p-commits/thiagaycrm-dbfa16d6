-- Remove conversations criadas para IDs @lid (não são roteáveis via Evolution → causavam "Bad Request" ao enviar).
DELETE FROM public.messages
WHERE conversation_id IN (
  SELECT c.id FROM public.conversations c
  WHERE c.channel = 'whatsapp'
    AND c.wa_contact_wa_id ~ '^[0-9]{14,}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.contacts ct
      WHERE ct.id = c.contact_id AND ct.type = 'group'
    )
);

DELETE FROM public.conversations c
WHERE c.channel = 'whatsapp'
  AND c.wa_contact_wa_id ~ '^[0-9]{14,}$'
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts ct
    WHERE ct.id = c.contact_id AND ct.type = 'group'
  );