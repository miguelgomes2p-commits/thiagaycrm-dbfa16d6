
-- =====================================================================
-- nfe_config: um registro por workspace
-- =====================================================================
CREATE TABLE public.nfe_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'focus_nfe',
  environment TEXT NOT NULL DEFAULT 'homologacao' CHECK (environment IN ('homologacao','producao')),
  token_homolog_enc TEXT,
  token_prod_enc TEXT,
  cnpj_emitente TEXT,
  ie_emitente TEXT,
  regime_tributario SMALLINT DEFAULT 1 CHECK (regime_tributario IN (1,2,3)),
  serie_padrao SMALLINT NOT NULL DEFAULT 1,
  cfop_entrada_padrao TEXT NOT NULL DEFAULT '1102',
  cfop_saida_padrao TEXT NOT NULL DEFAULT '5102',
  natureza_operacao_entrada TEXT NOT NULL DEFAULT 'Compra para comercialização',
  natureza_operacao_saida TEXT NOT NULL DEFAULT 'Venda de mercadoria',
  emit_logradouro TEXT,
  emit_numero TEXT,
  emit_bairro TEXT,
  emit_cep TEXT,
  emit_municipio TEXT,
  emit_ibge TEXT,
  emit_uf TEXT,
  emit_razao_social TEXT,
  emit_nome_fantasia TEXT,
  emit_telefone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_config TO authenticated;
GRANT ALL ON public.nfe_config TO service_role;

ALTER TABLE public.nfe_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfe_config_select" ON public.nfe_config
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "nfe_config_write" ON public.nfe_config
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE TRIGGER nfe_config_set_updated_at
  BEFORE UPDATE ON public.nfe_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- nfe_documents: notas emitidas
-- =====================================================================
CREATE TABLE public.nfe_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.renave_vehicles(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('entrada','saida')),
  environment TEXT NOT NULL CHECK (environment IN ('homologacao','producao')),
  ref TEXT NOT NULL,
  focus_status TEXT NOT NULL DEFAULT 'processando',
  chave TEXT,
  numero TEXT,
  serie TEXT,
  xml_url TEXT,
  pdf_url TEXT,
  danfe_url TEXT,
  error_message TEXT,
  payload_request JSONB,
  payload_response JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ref)
);

CREATE INDEX idx_nfe_documents_workspace ON public.nfe_documents(workspace_id, created_at DESC);
CREATE INDEX idx_nfe_documents_vehicle ON public.nfe_documents(vehicle_id);
CREATE INDEX idx_nfe_documents_chave ON public.nfe_documents(chave) WHERE chave IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_documents TO authenticated;
GRANT ALL ON public.nfe_documents TO service_role;

ALTER TABLE public.nfe_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfe_docs_select" ON public.nfe_documents
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "nfe_docs_write" ON public.nfe_documents
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE TRIGGER nfe_documents_set_updated_at
  BEFORE UPDATE ON public.nfe_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =====================================================================
-- renave_vehicles: chaves das NF-e vinculadas
-- =====================================================================
ALTER TABLE public.renave_vehicles
  ADD COLUMN IF NOT EXISTS nfe_entrada_chave TEXT,
  ADD COLUMN IF NOT EXISTS nfe_saida_chave TEXT;
