-- ============ VEÍCULOS: origem da aquisição e propriedade ============
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS acquisition_source text,
  ADD COLUMN IF NOT EXISTS ownership_type text NOT NULL DEFAULT 'owned',
  ADD COLUMN IF NOT EXISTS acquisition_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trade_in_for_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_acquisition_source_chk
    CHECK (acquisition_source IS NULL OR acquisition_source IN
      ('individual','company','auction','trade_in','consignment','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_ownership_type_chk
    CHECK (ownership_type IN ('owned','consigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_vehicles_acq_source ON public.vehicles(workspace_id, acquisition_source);
CREATE INDEX IF NOT EXISTS idx_vehicles_ownership ON public.vehicles(workspace_id, ownership_type);

-- ============ PERFIS FISCAIS: operações automotivas ============
ALTER TABLE public.fiscal_profiles
  ADD COLUMN IF NOT EXISTS operation_key text,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'exit',
  ADD COLUMN IF NOT EXISTS self_issued boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_model text NOT NULL DEFAULT '55',
  ADD COLUMN IF NOT EXISTS cfop_interstate text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS accountant_validated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accountant_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS accountant_validated_by uuid;

DO $$ BEGIN
  ALTER TABLE public.fiscal_profiles ADD CONSTRAINT fiscal_profiles_direction_chk
    CHECK (direction IN ('entry','exit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.fiscal_profiles ADD CONSTRAINT fiscal_profiles_operation_key_chk
    CHECK (operation_key IS NULL OR operation_key IN (
      'vehicle_purchase_non_taxpayer',
      'vehicle_purchase_taxpayer',
      'vehicle_purchase_auction',
      'vehicle_trade_in',
      'vehicle_sale_own_stock',
      'vehicle_consignment_entry',
      'vehicle_consignment_sale',
      'vehicle_return',
      'vehicle_transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_fiscal_profiles_operation
  ON public.fiscal_profiles(workspace_id, operation_key) WHERE active;

-- ============ DOCUMENTOS FISCAIS: entrada/saída, próprio/externo ============
ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'exit',
  ADD COLUMN IF NOT EXISTS issuer_type text NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS self_issued boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operation_key text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'issued',
  ADD COLUMN IF NOT EXISTS supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vehicle_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS operation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS issue_date date;

DO $$ BEGIN
  ALTER TABLE public.fiscal_documents ADD CONSTRAINT fiscal_documents_direction_chk
    CHECK (direction IN ('entry','exit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.fiscal_documents ADD CONSTRAINT fiscal_documents_issuer_type_chk
    CHECK (issuer_type IN ('self','external'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.fiscal_documents ADD CONSTRAINT fiscal_documents_source_chk
    CHECK (source IN ('issued','imported'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_vehicle_dir
  ON public.fiscal_documents(workspace_id, vehicle_id, direction);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_source
  ON public.fiscal_documents(workspace_id, source, status);

-- chave de acesso única por workspace para documentos importados (evita XML duplicado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_documents_imported_key
  ON public.fiscal_documents(workspace_id, access_key)
  WHERE source = 'imported' AND access_key IS NOT NULL;
