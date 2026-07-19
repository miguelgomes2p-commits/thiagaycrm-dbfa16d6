
-- =========================================================
-- RENAVE MODULE — FASE 1 (fundação + endpoints configuráveis)
-- =========================================================

-- 1) CONFIG DO MÓDULO POR WORKSPACE ------------------------
CREATE TABLE public.renave_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'homologacao' CHECK (environment IN ('homologacao','producao')),
  base_url TEXT NOT NULL DEFAULT 'https://renave.estaleiro.serpro.gov.br/renave-ws',
  cnpj TEXT,
  consumer_key TEXT,
  consumer_secret_ref TEXT,       -- nome do secret no Lovable Secrets
  certificate_ref TEXT,            -- nome do secret com o .p12 (base64)
  certificate_password_ref TEXT,   -- nome do secret com a senha do .p12
  oauth_token_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renave_config TO authenticated;
GRANT ALL ON public.renave_config TO service_role;
ALTER TABLE public.renave_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renave_config members read" ON public.renave_config FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "renave_config admins write" ON public.renave_config FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE TRIGGER trg_renave_config_updated BEFORE UPDATE ON public.renave_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) ENDPOINTS CONFIGURÁVEIS -------------------------------
CREATE TABLE public.renave_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                 -- ex: 'atpv_ultimo', 'crlve', 'cliente_autenticado'
  name TEXT NOT NULL,
  category TEXT NOT NULL,             -- 'atpv' | 'crlve' | 'estoque' | 'cliente' | 'pdf_atpv' | 'outros'
  method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  path_template TEXT NOT NULL,        -- ex: '/api/atpv-assinaturas/{placa}/{renavam}/ultimo'
  query_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_template JSONB,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renave_endpoints TO authenticated;
GRANT ALL ON public.renave_endpoints TO service_role;
ALTER TABLE public.renave_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renave_endpoints members read" ON public.renave_endpoints FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "renave_endpoints admins write" ON public.renave_endpoints FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE TRIGGER trg_renave_endpoints_updated BEFORE UPDATE ON public.renave_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) VEÍCULOS ---------------------------------------------
CREATE TABLE public.renave_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  placa TEXT,
  chassi TEXT,
  renavam TEXT,
  marca TEXT,
  modelo TEXT,
  ano_fabricacao INT,
  ano_modelo INT,
  cor TEXT,
  combustivel TEXT,
  km INT,
  valor_compra NUMERIC(14,2),
  valor_venda NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','entrada_pendente','em_estoque','saida_pendente','vendido','cancelado')),
  data_entrada DATE,
  data_saida DATE,
  fornecedor TEXT,
  comprador_documento TEXT,
  comprador_nome TEXT,
  observacoes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_renave_vehicles_ws ON public.renave_vehicles(workspace_id);
CREATE INDEX idx_renave_vehicles_placa ON public.renave_vehicles(workspace_id, placa);
CREATE INDEX idx_renave_vehicles_chassi ON public.renave_vehicles(workspace_id, chassi);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renave_vehicles TO authenticated;
GRANT ALL ON public.renave_vehicles TO service_role;
ALTER TABLE public.renave_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renave_vehicles members all" ON public.renave_vehicles FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_renave_vehicles_updated BEFORE UPDATE ON public.renave_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) OPERAÇÕES --------------------------------------------
CREATE TABLE public.renave_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.renave_vehicles(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('entrada','saida','consulta_atpv','consulta_crlve','pdf_atpv','nfe','outra')),
  endpoint_code TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','sucesso','falha','cancelada')),
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  numero_documento TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_renave_ops_ws ON public.renave_operations(workspace_id, created_at DESC);
CREATE INDEX idx_renave_ops_vehicle ON public.renave_operations(vehicle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renave_operations TO authenticated;
GRANT ALL ON public.renave_operations TO service_role;
ALTER TABLE public.renave_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renave_ops members all" ON public.renave_operations FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_renave_ops_updated BEFORE UPDATE ON public.renave_operations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) FILA -------------------------------------------------
CREATE TABLE public.renave_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.renave_operations(id) ON DELETE CASCADE,
  endpoint_code TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed','dead')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_renave_queue_run ON public.renave_queue(status, next_run_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renave_queue TO authenticated;
GRANT ALL ON public.renave_queue TO service_role;
ALTER TABLE public.renave_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renave_queue members all" ON public.renave_queue FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_renave_queue_updated BEFORE UPDATE ON public.renave_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 6) LOGS HTTP --------------------------------------------
CREATE TABLE public.renave_http_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.renave_operations(id) ON DELETE SET NULL,
  endpoint_code TEXT,
  method TEXT,
  url TEXT,
  request_headers JSONB,
  request_body JSONB,
  response_status INT,
  response_headers JSONB,
  response_body JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_renave_http_logs_ws ON public.renave_http_logs(workspace_id, created_at DESC);
GRANT SELECT, INSERT ON public.renave_http_logs TO authenticated;
GRANT ALL ON public.renave_http_logs TO service_role;
ALTER TABLE public.renave_http_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "renave_logs members read" ON public.renave_http_logs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "renave_logs members insert" ON public.renave_http_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 7) FUNÇÃO DE SEED (endpoints do Swagger) ----------------
CREATE OR REPLACE FUNCTION public.renave_seed_endpoints(_workspace_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted INT := 0;
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.renave_endpoints (workspace_id, code, name, category, method, path_template, description, is_system)
  VALUES
    (_workspace_id, 'atpv_ultimo', 'ATPV — última assinatura', 'atpv', 'GET',
      '/api/atpv-assinaturas/{placa}/{renavam}/ultimo', 'Consultar assinaturas de ATPV', true),
    (_workspace_id, 'crlve', 'CRLVe — último PDF', 'crlve', 'GET',
      '/api/crlve/{placaVeiculo}/{renavamVeiculo}', 'Consultar PDF do último CRLVe do veículo', true),
    (_workspace_id, 'crlve_codigo_seguranca', 'CRLVe — PDF código de segurança do CRV', 'crlve', 'GET',
      '/api/crlve/{placaVeiculo}/{renavamVeiculo}/pdf-codigo-seguranca-crv', 'Consultar PDF com o código de segurança do último CRV', true),
    (_workspace_id, 'cliente_autenticado', 'Cliente autenticado', 'cliente', 'GET',
      '/api/cliente-autenticado', 'Consultar os dados do cliente autenticado', true),
    (_workspace_id, 'pdf_atpv_por_chassi', 'PDF do ATPV por chassi', 'pdf_atpv', 'GET',
      '/api/pdf-atpv', 'Consultar PDF do ATPV do veículo (query: chassi)', true),
    (_workspace_id, 'pdf_atpv_por_placa', 'PDF do ATPV por placa/renavam', 'pdf_atpv', 'GET',
      '/api/pdf-atpv/{placa}/{renavam}', 'Consultar PDF do ATPV do veículo', true),
    (_workspace_id, 'termo_entrada_estoque', 'Termo de Entrada em Estoque', 'estoque', 'GET',
      '/api/estoques/{idEstoque}/termo-entrada-estoque', 'Consultar Termo de Entrada em Estoque', true),
    (_workspace_id, 'termo_saida_estoque', 'Termo de Saída de Estoque', 'estoque', 'GET',
      '/api/estoques/{idEstoque}/termo-saida-estoque', 'Consultar Termo de Saída de Estoque', true)
  ON CONFLICT (workspace_id, code) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;
