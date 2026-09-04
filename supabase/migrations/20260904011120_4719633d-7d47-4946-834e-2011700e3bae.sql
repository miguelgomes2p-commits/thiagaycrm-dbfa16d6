ALTER TABLE public.nfe_config
  ADD COLUMN IF NOT EXISTS certificate_source TEXT,
  ADD COLUMN IF NOT EXISTS certificate_verified_at TIMESTAMPTZ;

UPDATE public.fiscal_profiles
   SET operation_key = 'vehicle_sale_own_stock',
       direction = 'exit'
 WHERE operation_key IS NULL
   AND upper(btrim(name)) = 'VEÍCULO PRÓPRIO';

UPDATE public.fiscal_profiles
   SET operation_key = 'vehicle_consignment_sale',
       direction = 'exit'
 WHERE operation_key IS NULL
   AND upper(btrim(name)) = 'VEÍCULO CONSIGNADO';