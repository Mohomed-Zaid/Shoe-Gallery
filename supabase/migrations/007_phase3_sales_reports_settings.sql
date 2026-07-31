-- Phase 3 schema upgrades: customers, POS, sales, returns, reports, settings

-- Ensure shared role helper exists even if earlier migrations were not applied
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_cashier()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR role = 'cashier')
  );
$$;

-- Customer profile enhancements
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Sales enhancements
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_status_check'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_status_check
      CHECK (status IN ('held', 'completed', 'cancelled'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_number_key
  ON sales(invoice_number)
  WHERE invoice_number IS NOT NULL;

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS size_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS color_snapshot TEXT;

-- Held sales to support POS resume flow without affecting stock
CREATE TABLE IF NOT EXISTS held_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  cart_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE held_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and Cashier can view held sales" ON held_sales;
CREATE POLICY "Admin and Cashier can view held sales" ON held_sales
  FOR SELECT USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can insert held sales" ON held_sales;
CREATE POLICY "Admin and Cashier can insert held sales" ON held_sales
  FOR INSERT WITH CHECK (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can update held sales" ON held_sales;
CREATE POLICY "Admin and Cashier can update held sales" ON held_sales
  FOR UPDATE USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can delete held sales" ON held_sales;
CREATE POLICY "Admin and Cashier can delete held sales" ON held_sales
  FOR DELETE USING (public.is_admin_or_cashier());

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS held_sales_touch_updated_at ON held_sales;
CREATE TRIGGER held_sales_touch_updated_at
  BEFORE UPDATE ON held_sales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Returns and exchanges
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  return_type TEXT NOT NULL,
  refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  store_credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  reason TEXT
);

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and Cashier can view returns" ON returns;
CREATE POLICY "Admin and Cashier can view returns" ON returns
  FOR SELECT USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can insert returns" ON returns;
CREATE POLICY "Admin and Cashier can insert returns" ON returns
  FOR INSERT WITH CHECK (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can update returns" ON returns;
CREATE POLICY "Admin and Cashier can update returns" ON returns
  FOR UPDATE USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can view return items" ON return_items;
CREATE POLICY "Admin and Cashier can view return items" ON return_items
  FOR SELECT USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can insert return items" ON return_items;
CREATE POLICY "Admin and Cashier can insert return items" ON return_items
  FOR INSERT WITH CHECK (public.is_admin_or_cashier());

-- Store and business settings
CREATE TABLE IF NOT EXISTS store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL DEFAULT 'Shoe Gallery',
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  receipt_footer TEXT,
  currency_code TEXT NOT NULL DEFAULT 'LKR',
  tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  default_low_stock_limit INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view settings" ON store_settings;
CREATE POLICY "Authenticated users can view settings" ON store_settings
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can manage settings" ON store_settings;
CREATE POLICY "Admin can manage settings" ON store_settings
  FOR ALL USING (public.is_admin());

DROP TRIGGER IF EXISTS store_settings_touch_updated_at ON store_settings;
CREATE TRIGGER store_settings_touch_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO store_settings (store_name)
SELECT 'Shoe Gallery'
WHERE NOT EXISTS (SELECT 1 FROM store_settings);

-- Ensure cashier can fully work with POS domain tables
DROP POLICY IF EXISTS "Admin and Cashier can create sale items" ON sale_items;
CREATE POLICY "Admin and Cashier can create sale items" ON sale_items
  FOR INSERT WITH CHECK (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can update sales" ON sales;
CREATE POLICY "Admin and Cashier can update sales" ON sales
  FOR UPDATE USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can update sale items" ON sale_items;
CREATE POLICY "Admin and Cashier can update sale items" ON sale_items
  FOR UPDATE USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Admin and Cashier can manage inventory history" ON inventory_history;
CREATE POLICY "Admin and Cashier can insert inventory history" ON inventory_history
  FOR INSERT WITH CHECK (public.is_admin_or_cashier());
