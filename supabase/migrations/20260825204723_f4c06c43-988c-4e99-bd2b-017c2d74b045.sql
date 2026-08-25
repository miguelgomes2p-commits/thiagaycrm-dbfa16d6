ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS feature_inventory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_fiscal boolean NOT NULL DEFAULT true;