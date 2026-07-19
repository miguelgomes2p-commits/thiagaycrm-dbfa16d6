
-- Enums
DO $$ BEGIN
  CREATE TYPE public.label_kind AS ENUM ('system','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.label_scope AS ENUM ('conversation','contact','lead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Labels table
CREATE TABLE public.labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  kind public.label_kind NOT NULL DEFAULT 'custom',
  scope public.label_scope NOT NULL DEFAULT 'conversation',
  system_ref TEXT,             -- e.g. 'whatsapp_number:<uuid>' for system labels
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX labels_ws_name_scope_uniq ON public.labels (workspace_id, lower(name), scope) WHERE archived = FALSE;
CREATE UNIQUE INDEX labels_system_ref_uniq ON public.labels (workspace_id, system_ref) WHERE system_ref IS NOT NULL;
CREATE INDEX labels_ws_idx ON public.labels (workspace_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.labels TO authenticated;
GRANT ALL ON public.labels TO service_role;

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read labels" ON public.labels
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins insert labels" ON public.labels
  FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

CREATE POLICY "admins update custom labels" ON public.labels
  FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]) AND kind = 'custom')
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]) AND kind = 'custom');

CREATE POLICY "admins delete custom labels" ON public.labels
  FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]) AND kind = 'custom');

CREATE TRIGGER labels_updated_at BEFORE UPDATE ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Conversation labels (N:N)
CREATE TABLE public.conversation_labels (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, label_id)
);
CREATE INDEX conv_labels_label_idx ON public.conversation_labels (label_id);
CREATE INDEX conv_labels_ws_idx ON public.conversation_labels (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_labels TO authenticated;
GRANT ALL ON public.conversation_labels TO service_role;

ALTER TABLE public.conversation_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read conv labels" ON public.conversation_labels
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "members write conv labels" ON public.conversation_labels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "members delete conv labels" ON public.conversation_labels
  FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Helper: get or create system label for a WhatsApp number
CREATE OR REPLACE FUNCTION public.ensure_whatsapp_number_label(_workspace_id UUID, _wa_number_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref TEXT := 'whatsapp_number:' || _wa_number_id::text;
  lbl_id UUID;
  wa_label TEXT;
  palette TEXT[] := ARRAY['#25D366','#128C7E','#075E54','#34B7F1','#f59e0b','#ef4444','#8b5cf6','#22c55e','#0ea5e9','#f97316'];
  color_pick TEXT;
BEGIN
  SELECT id INTO lbl_id FROM public.labels
   WHERE workspace_id = _workspace_id AND system_ref = ref;
  IF lbl_id IS NOT NULL THEN RETURN lbl_id; END IF;

  SELECT label INTO wa_label FROM public.whatsapp_numbers WHERE id = _wa_number_id;
  color_pick := palette[1 + (abs(hashtext(_wa_number_id::text)) % array_length(palette,1))];

  INSERT INTO public.labels (workspace_id, name, color, kind, scope, system_ref, sort_order)
  VALUES (_workspace_id, COALESCE('📱 ' || wa_label, 'WhatsApp'), color_pick, 'system', 'conversation', ref, -1000)
  RETURNING id INTO lbl_id;

  RETURN lbl_id;
END $$;

-- Trigger: auto-tag new WhatsApp conversation with its number label
CREATE OR REPLACE FUNCTION public.tg_conversation_autotag_wa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE lbl_id UUID;
BEGIN
  IF NEW.channel = 'whatsapp' AND NEW.whatsapp_number_id IS NOT NULL THEN
    lbl_id := public.ensure_whatsapp_number_label(NEW.workspace_id, NEW.whatsapp_number_id);
    INSERT INTO public.conversation_labels (conversation_id, label_id, workspace_id, assigned_by)
    VALUES (NEW.id, lbl_id, NEW.workspace_id, NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER conversations_autotag_wa
  AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_autotag_wa();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.labels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_labels;

-- Backfill: create system labels for existing WhatsApp numbers and tag existing conversations
DO $$
DECLARE r RECORD; lbl UUID;
BEGIN
  FOR r IN SELECT id, workspace_id FROM public.whatsapp_numbers LOOP
    PERFORM public.ensure_whatsapp_number_label(r.workspace_id, r.id);
  END LOOP;

  FOR r IN SELECT id, workspace_id, whatsapp_number_id FROM public.conversations
           WHERE channel = 'whatsapp' AND whatsapp_number_id IS NOT NULL LOOP
    lbl := public.ensure_whatsapp_number_label(r.workspace_id, r.whatsapp_number_id);
    INSERT INTO public.conversation_labels (conversation_id, label_id, workspace_id)
    VALUES (r.id, lbl, r.workspace_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
