ALTER TABLE public.workspace_locations
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'BR';

CREATE OR REPLACE FUNCTION public.tg_workspace_locations_single_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.workspace_locations
       SET is_default = false, updated_at = now()
     WHERE workspace_id = NEW.workspace_id
       AND id <> NEW.id
       AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_locations_single_default ON public.workspace_locations;
CREATE TRIGGER trg_workspace_locations_single_default
AFTER INSERT OR UPDATE OF is_default ON public.workspace_locations
FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION public.tg_workspace_locations_single_default();