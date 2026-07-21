CREATE OR REPLACE FUNCTION public.ensure_whatsapp_number_label(_workspace_id uuid, _wa_number_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ref TEXT := 'whatsapp_number:' || _wa_number_id::text;
  lbl_id UUID;
  wa_label TEXT;
  lbl_name TEXT;
  palette TEXT[] := ARRAY['#25D366','#128C7E','#075E54','#34B7F1','#f59e0b','#ef4444','#8b5cf6','#22c55e','#0ea5e9','#f97316'];
  color_pick TEXT;
BEGIN
  -- 1) already linked by system_ref?
  SELECT id INTO lbl_id FROM public.labels
   WHERE workspace_id = _workspace_id AND system_ref = ref;
  IF lbl_id IS NOT NULL THEN RETURN lbl_id; END IF;

  SELECT label INTO wa_label FROM public.whatsapp_numbers WHERE id = _wa_number_id;
  lbl_name := COALESCE('📱 ' || wa_label, 'WhatsApp');
  color_pick := palette[1 + (abs(hashtext(_wa_number_id::text)) % array_length(palette,1))];

  -- 2) match by name (avoids unique (workspace_id, lower(name), scope) violation)
  SELECT id INTO lbl_id FROM public.labels
   WHERE workspace_id = _workspace_id
     AND scope = 'conversation'
     AND lower(name) = lower(lbl_name);
  IF lbl_id IS NOT NULL THEN
    UPDATE public.labels SET system_ref = ref WHERE id = lbl_id AND system_ref IS DISTINCT FROM ref;
    RETURN lbl_id;
  END IF;

  -- 3) create fresh
  INSERT INTO public.labels (workspace_id, name, color, kind, scope, system_ref, sort_order)
  VALUES (_workspace_id, lbl_name, color_pick, 'system', 'conversation', ref, -1000)
  ON CONFLICT (workspace_id, (lower(name)), scope) DO UPDATE SET system_ref = EXCLUDED.system_ref
  RETURNING id INTO lbl_id;

  RETURN lbl_id;
END $function$;