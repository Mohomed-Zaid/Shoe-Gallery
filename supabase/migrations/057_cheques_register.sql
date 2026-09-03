-- Standalone physical cheque register. This table has no financial relationships
-- or triggers and intentionally does not reference customers or suppliers.
CREATE TABLE IF NOT EXISTS public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  cheque_number text NOT NULL CHECK (btrim(cheque_number) <> ''),
  bank text NOT NULL CHECK (btrim(bank) <> ''),
  cheque_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cheques_date_created
  ON public.cheques (cheque_date, created_at DESC);

ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and Cashier can view cheques"
  ON public.cheques FOR SELECT TO authenticated
  USING (public.is_admin_or_cashier());

CREATE POLICY "Admin and Cashier can insert cheques"
  ON public.cheques FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_cashier());

CREATE POLICY "Admin and Cashier can update cheques"
  ON public.cheques FOR UPDATE TO authenticated
  USING (public.is_admin_or_cashier())
  WITH CHECK (public.is_admin_or_cashier());

CREATE POLICY "Admin and Cashier can delete cheques"
  ON public.cheques FOR DELETE TO authenticated
  USING (public.is_admin_or_cashier());

DROP TRIGGER IF EXISTS cheques_touch_updated_at ON public.cheques;
CREATE TRIGGER cheques_touch_updated_at
  BEFORE UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
