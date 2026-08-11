-- 1) Locais salvos do workspace (envio de localização no WhatsApp)
CREATE TABLE public.workspace_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_locations TO authenticated;
GRANT ALL ON public.workspace_locations TO service_role;

ALTER TABLE public.workspace_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read workspace locations" ON public.workspace_locations
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins insert workspace locations" ON public.workspace_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "admins update workspace locations" ON public.workspace_locations
  FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "admins delete workspace locations" ON public.workspace_locations
  FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE INDEX idx_workspace_locations_ws ON public.workspace_locations(workspace_id) WHERE is_active;

CREATE TRIGGER trg_workspace_locations_updated
  BEFORE UPDATE ON public.workspace_locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Grupos de campos
CREATE TABLE public.lead_field_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_field_groups TO authenticated;
GRANT ALL ON public.lead_field_groups TO service_role;

ALTER TABLE public.lead_field_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read lead field groups" ON public.lead_field_groups
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins write lead field groups" ON public.lead_field_groups
  FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE INDEX idx_lead_field_groups_ws ON public.lead_field_groups(workspace_id, sort_order);

CREATE TRIGGER trg_lead_field_groups_updated
  BEFORE UPDATE ON public.lead_field_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Definições de campos
CREATE TABLE public.lead_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'lead',
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'TEXT',
  group_id uuid REFERENCES public.lead_field_groups(id) ON DELETE SET NULL,
  placeholder text,
  help_text text,
  default_value text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_config jsonb NOT NULL DEFAULT '{"CREATE_FROM_CONVERSATION":true,"CREATE_FROM_PIPELINE":true,"LEAD_DETAIL":true,"PIPELINE_CARD":false,"LEAD_PREVIEW":false}'::jsonb,
  pipeline_ids uuid[] NOT NULL DEFAULT '{}',
  required_stage_ids uuid[] NOT NULL DEFAULT '{}',
  conditional_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_searchable boolean NOT NULL DEFAULT false,
  is_filterable boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_field_definitions_key_unique UNIQUE (workspace_id, entity_type, field_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_field_definitions TO authenticated;
GRANT ALL ON public.lead_field_definitions TO service_role;

ALTER TABLE public.lead_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read lead field definitions" ON public.lead_field_definitions
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "admins write lead field definitions" ON public.lead_field_definitions
  FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE INDEX idx_lead_field_defs_ws ON public.lead_field_definitions(workspace_id, sort_order) WHERE is_active;

CREATE TRIGGER trg_lead_field_definitions_updated
  BEFORE UPDATE ON public.lead_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Índice para consultas/filtros sobre os valores dinâmicos já existentes em leads.custom_fields
CREATE INDEX IF NOT EXISTS idx_leads_custom_fields_gin ON public.leads USING gin (custom_fields);
