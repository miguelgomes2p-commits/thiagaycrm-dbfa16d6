-- 1) Feature flag: financial_management_beta
CREATE TABLE public.financial_beta_users (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_beta_users TO authenticated;
GRANT ALL ON public.financial_beta_users TO service_role;
ALTER TABLE public.financial_beta_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own beta row readable" ON public.financial_beta_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.financial_beta_users (user_id, enabled) VALUES
  ('aa2dfcf2-4f31-4957-8ebf-a1e8136bb437', true),
  ('7c908f02-9f54-4caa-899b-84e88cffe4b5', true)
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_financial_beta(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.financial_beta_users WHERE user_id = _user_id AND enabled)
$$;
GRANT EXECUTE ON FUNCTION public.has_financial_beta(uuid) TO authenticated, service_role;

-- 2) Financeiro do veículo (1:1 com vehicles, sem alterar vehicles)
CREATE TABLE public.vehicle_financials (
  vehicle_id uuid PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  acquisition_cost numeric(14,2),
  acquired_at date,
  sale_amount numeric(14,2),
  sale_date date,
  sold_to_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  sold_by uuid,
  fiscal_document_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_financials_ws ON public.vehicle_financials(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_financials TO authenticated;
GRANT ALL ON public.vehicle_financials TO service_role;
ALTER TABLE public.vehicle_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial beta members manage vehicle financials"
  ON public.vehicle_financials FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND public.has_financial_beta(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND public.has_financial_beta(auth.uid()));
CREATE TRIGGER trg_vehicle_financials_updated_at BEFORE UPDATE ON public.vehicle_financials
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Despesas do veículo
CREATE TABLE public.vehicle_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'outros',
  description text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_expenses_vehicle ON public.vehicle_expenses(vehicle_id) WHERE status = 'active';
CREATE INDEX idx_vehicle_expenses_ws ON public.vehicle_expenses(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_expenses TO authenticated;
GRANT ALL ON public.vehicle_expenses TO service_role;
ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial beta members manage vehicle expenses"
  ON public.vehicle_expenses FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND public.has_financial_beta(auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND public.has_financial_beta(auth.uid()));
CREATE TRIGGER trg_vehicle_expenses_updated_at BEFORE UPDATE ON public.vehicle_expenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Auditoria financeira
CREATE TABLE public.vehicle_financial_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  field text NOT NULL,
  old_value numeric(14,2),
  new_value numeric(14,2),
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicle_financial_audit_vehicle ON public.vehicle_financial_audit(vehicle_id, created_at DESC);
GRANT SELECT ON public.vehicle_financial_audit TO authenticated;
GRANT ALL ON public.vehicle_financial_audit TO service_role;
ALTER TABLE public.vehicle_financial_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial beta members read audit"
  ON public.vehicle_financial_audit FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND public.has_financial_beta(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_vehicle_financials_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.acquisition_cost IS DISTINCT FROM OLD.acquisition_cost THEN
    INSERT INTO public.vehicle_financial_audit(workspace_id, vehicle_id, entity, entity_id, field, old_value, new_value, changed_by)
    VALUES (NEW.workspace_id, NEW.vehicle_id, 'vehicle_financials', NEW.vehicle_id, 'acquisition_cost',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.acquisition_cost END, NEW.acquisition_cost, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.sale_amount IS DISTINCT FROM OLD.sale_amount THEN
    INSERT INTO public.vehicle_financial_audit(workspace_id, vehicle_id, entity, entity_id, field, old_value, new_value, changed_by)
    VALUES (NEW.workspace_id, NEW.vehicle_id, 'vehicle_financials', NEW.vehicle_id, 'sale_amount',
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.sale_amount END, NEW.sale_amount, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_vehicle_financials_audit AFTER INSERT OR UPDATE ON public.vehicle_financials
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicle_financials_audit();

CREATE OR REPLACE FUNCTION public.tg_vehicle_expenses_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.vehicle_financial_audit(workspace_id, vehicle_id, entity, entity_id, field, old_value, new_value, changed_by)
  VALUES (NEW.workspace_id, NEW.vehicle_id, 'vehicle_expenses', NEW.id,
          CASE WHEN TG_OP = 'INSERT' THEN 'expense_created'
               WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'expense_status:' || NEW.status
               ELSE 'expense_amount' END,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.amount END, NEW.amount, auth.uid());
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_vehicle_expenses_audit AFTER INSERT OR UPDATE ON public.vehicle_expenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicle_expenses_audit();

-- 5) Relatório agregado (evita N+1)
CREATE OR REPLACE FUNCTION public.financial_overview(_workspace_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sold jsonb;
  _stock jsonb;
  _rows jsonb;
  _age jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_workspace_member(_workspace_id, _uid) OR NOT public.has_financial_beta(_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH exp AS (
    SELECT vehicle_id, SUM(amount) AS total
    FROM public.vehicle_expenses
    WHERE workspace_id = _workspace_id AND status = 'active'
    GROUP BY vehicle_id
  ),
  sold AS (
    SELECT v.id, v.brand, v.model, v.version, v.year_model, v.price,
           f.acquisition_cost, f.sale_amount,
           COALESCE(f.sale_date, v.sold_at::date) AS sale_date,
           COALESCE(e.total, 0) AS expenses_total
    FROM public.vehicles v
    JOIN public.vehicle_financials f ON f.vehicle_id = v.id
    LEFT JOIN exp e ON e.vehicle_id = v.id
    WHERE v.workspace_id = _workspace_id
      AND v.deleted_at IS NULL
      AND v.status = 'sold'
      AND f.sale_amount IS NOT NULL
      AND COALESCE(f.sale_date, v.sold_at::date) BETWEEN _from AND _to
  )
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'revenue', COALESCE(SUM(sale_amount), 0),
    'acquisition', COALESCE(SUM(acquisition_cost), 0),
    'expenses', COALESCE(SUM(expenses_total), 0),
    'grossProfit', COALESCE(SUM(sale_amount - COALESCE(acquisition_cost, 0)), 0),
    'realProfit', COALESCE(SUM(sale_amount - COALESCE(acquisition_cost, 0) - expenses_total), 0),
    'avgMargin', CASE WHEN COALESCE(SUM(sale_amount), 0) > 0
      THEN ROUND(SUM(sale_amount - COALESCE(acquisition_cost, 0) - expenses_total) / SUM(sale_amount) * 100, 2)
      ELSE 0 END
  ), COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'title', concat_ws(' ', brand, model, version), 'year', year_model,
      'acquisition', acquisition_cost, 'sale', sale_amount, 'expenses', expenses_total,
      'grossProfit', sale_amount - COALESCE(acquisition_cost, 0),
      'realProfit', sale_amount - COALESCE(acquisition_cost, 0) - expenses_total,
      'margin', CASE WHEN sale_amount > 0
        THEN ROUND((sale_amount - COALESCE(acquisition_cost, 0) - expenses_total) / sale_amount * 100, 2) ELSE 0 END,
      'saleDate', sale_date
    ) ORDER BY (sale_amount - COALESCE(acquisition_cost, 0) - expenses_total) DESC), '[]'::jsonb)
  INTO _sold, _rows FROM sold;

  WITH exp AS (
    SELECT vehicle_id, SUM(amount) AS total
    FROM public.vehicle_expenses
    WHERE workspace_id = _workspace_id AND status = 'active'
    GROUP BY vehicle_id
  ),
  stock AS (
    SELECT v.id, v.price, v.created_at,
           COALESCE(f.acquisition_cost, 0) AS acquisition_cost,
           COALESCE(f.acquired_at, v.created_at::date) AS acquired_at,
           COALESCE(e.total, 0) AS expenses_total
    FROM public.vehicles v
    LEFT JOIN public.vehicle_financials f ON f.vehicle_id = v.id
    LEFT JOIN exp e ON e.vehicle_id = v.id
    WHERE v.workspace_id = _workspace_id AND v.deleted_at IS NULL
      AND v.status IN ('available', 'reserved')
  )
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'acquisition', COALESCE(SUM(acquisition_cost), 0),
    'expenses', COALESCE(SUM(expenses_total), 0),
    'invested', COALESCE(SUM(acquisition_cost + expenses_total), 0),
    'asking', COALESCE(SUM(COALESCE(price, 0)), 0),
    'potentialProfit', COALESCE(SUM(COALESCE(price, 0) - acquisition_cost - expenses_total), 0)
  ), COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT CASE
               WHEN (CURRENT_DATE - acquired_at) <= 30 THEN '0-30'
               WHEN (CURRENT_DATE - acquired_at) <= 60 THEN '31-60'
               WHEN (CURRENT_DATE - acquired_at) <= 90 THEN '61-90'
               ELSE '90+' END AS bucket,
             COUNT(*) AS count,
             SUM(acquisition_cost + expenses_total) AS invested
      FROM stock GROUP BY 1
    ) x
  ), '[]'::jsonb)
  INTO _stock, _age FROM stock;

  RETURN jsonb_build_object('sold', _sold, 'rows', _rows, 'stock', _stock, 'age', _age);
END;
$$;
GRANT EXECUTE ON FUNCTION public.financial_overview(uuid, date, date) TO authenticated, service_role;