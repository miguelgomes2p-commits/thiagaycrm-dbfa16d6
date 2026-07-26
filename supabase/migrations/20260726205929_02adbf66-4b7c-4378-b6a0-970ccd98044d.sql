
UPDATE public.webhook_events
SET status = 'done',
    processed_at = now(),
    last_error = COALESCE(last_error, 'orphan: whatsapp_number deletado')
WHERE status IN ('pending','failed','processing')
  AND (
    whatsapp_number_id IS NULL
    OR whatsapp_number_id NOT IN (SELECT id FROM public.whatsapp_numbers)
  );
