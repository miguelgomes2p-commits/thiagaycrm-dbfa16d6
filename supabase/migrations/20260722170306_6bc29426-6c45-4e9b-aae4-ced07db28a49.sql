REVOKE EXECUTE ON FUNCTION public.ensure_whatsapp_number_label(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_whatsapp_number_label(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_whatsapp_number_label(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_whatsapp_number_label(uuid, uuid) TO service_role;