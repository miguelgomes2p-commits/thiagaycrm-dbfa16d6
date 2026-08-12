-- ============ FISCAL PROFILES ============
CREATE TABLE public.fiscal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  operation_type TEXT NOT NULL DEFAULT 'venda_veiculo_usado',
  cfop TEXT,
  ncm TEXT,
  cest TEXT,
  product_origin TEXT DEFAULT '0',
  natureza_operacao TEXT,
  tax_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  additional_information TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fiscal_profiles_ws_idx ON public.fiscal_profiles(workspace_id) WHERE active;
CREATE UNIQUE INDEX fiscal_profiles_one_default ON public.fiscal_profiles(workspace_id) WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_profiles TO authenticated;
GRANT ALL ON public.fiscal_profiles TO service_role;
ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_profiles_select ON public.fiscal_profiles FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY fiscal_profiles_write ON public.fiscal_profiles FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE TRIGGER trg_fiscal_profiles_updated BEFORE UPDATE ON public.fiscal_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FISCAL DOCUMENTS ============
CREATE TABLE public.fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'NFE',
  environment TEXT NOT NULL DEFAULT 'homologation',
  provider TEXT NOT NULL DEFAULT 'focus_nfe',
  provider_document_id TEXT,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  fiscal_profile_id UUID REFERENCES public.fiscal_profiles(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  series TEXT,
  number TEXT,
  access_key TEXT,
  protocol TEXT,
  total_amount NUMERIC(14,2),
  idempotency_key TEXT NOT NULL,
  issued_at TIMESTAMPTZ,
  authorized_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  rejection_code TEXT,
  rejection_message TEXT,
  xml_storage_path TEXT,
  danfe_storage_path TEXT,
  xml_url TEXT,
  danfe_url TEXT,
  issuer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fiscal_documents_idem ON public.fiscal_documents(workspace_id, idempotency_key);
CREATE INDEX fiscal_documents_ws_created ON public.fiscal_documents(workspace_id, created_at DESC);
CREATE INDEX fiscal_documents_vehicle ON public.fiscal_documents(vehicle_id);
CREATE INDEX fiscal_documents_key ON public.fiscal_documents(access_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_documents TO authenticated;
GRANT ALL ON public.fiscal_documents TO service_role;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_documents_select ON public.fiscal_documents FOR SELECT TO authenticated
  USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (public.is_workspace_member(workspace_id, auth.uid()) AND owner_user_id = auth.uid())
  );
CREATE POLICY fiscal_documents_write ON public.fiscal_documents FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));
CREATE TRIGGER trg_fiscal_documents_updated BEFORE UPDATE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ EMISSION ATTEMPTS (technical log) ============
CREATE TABLE public.fiscal_emission_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'focus_nfe',
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fiscal_attempts_doc ON public.fiscal_emission_attempts(document_id, created_at DESC);

GRANT SELECT ON public.fiscal_emission_attempts TO authenticated;
GRANT ALL ON public.fiscal_emission_attempts TO service_role;
ALTER TABLE public.fiscal_emission_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_attempts_select ON public.fiscal_emission_attempts FOR SELECT TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- ============ CONFIG EXTENSIONS ============
ALTER TABLE public.nfe_config
  ADD COLUMN IF NOT EXISTS certificate_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS certificate_expires_at DATE,
  ADD COLUMN IF NOT EXISTS certificate_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_filename TEXT,
  ADD COLUMN IF NOT EXISTS provider_company_id TEXT,
  ADD COLUMN IF NOT EXISTS production_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS production_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS production_enabled_by UUID,
  ADD COLUMN IF NOT EXISTS emit_complemento TEXT,
  ADD COLUMN IF NOT EXISTS emit_email TEXT,
  ADD COLUMN IF NOT EXISTS accountant_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============ VEHICLES: default fiscal profile ============
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fiscal_profile_id UUID REFERENCES public.fiscal_profiles(id) ON DELETE SET NULL;