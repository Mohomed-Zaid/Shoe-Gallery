-- Storage bucket for product images + cashier-scoped RLS policies
-- Run in Supabase SQL Editor after migrations 001-003

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects
    FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admin upload product images" ON storage.objects;
CREATE POLICY "Admin upload product images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "Admin update product images" ON storage.objects;
CREATE POLICY "Admin update product images" ON storage.objects
    FOR UPDATE USING (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "Admin delete product images" ON storage.objects;
CREATE POLICY "Admin delete product images" ON storage.objects
    FOR DELETE USING (bucket_id = 'product-images' AND public.is_admin());

CREATE OR REPLACE FUNCTION public.is_cashier()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'cashier'
  );
$$;

-- Tighten read access: cashiers only see POS-related data
DROP POLICY IF EXISTS "Authenticated users can view categories" ON categories;
CREATE POLICY "Cashier can view categories" ON categories
    FOR SELECT USING (public.is_cashier());

DROP POLICY IF EXISTS "Authenticated users can view brands" ON brands;
CREATE POLICY "Cashier can view brands" ON brands
    FOR SELECT USING (public.is_cashier());

DROP POLICY IF EXISTS "Authenticated users can view products" ON products;
CREATE POLICY "Cashier can view products" ON products
    FOR SELECT USING (public.is_cashier());

DROP POLICY IF EXISTS "Authenticated users can view product variants" ON product_variants;
CREATE POLICY "Cashier can view product variants" ON product_variants
    FOR SELECT USING (public.is_cashier());

DROP POLICY IF EXISTS "Authenticated users can view customers" ON customers;
CREATE POLICY "Cashier can view customers" ON customers
    FOR SELECT USING (public.is_cashier());

CREATE POLICY "Cashier can manage customers" ON customers
    FOR INSERT WITH CHECK (public.is_cashier());

CREATE POLICY "Cashier can update customers" ON customers
    FOR UPDATE USING (public.is_cashier());

DROP POLICY IF EXISTS "Authenticated users can view sales" ON sales;
CREATE POLICY "Cashier can view sales" ON sales
    FOR SELECT USING (public.is_cashier());

CREATE POLICY "Cashier can create sales" ON sales
    FOR INSERT WITH CHECK (public.is_cashier());

DROP POLICY IF EXISTS "Authenticated users can view sale items" ON sale_items;
CREATE POLICY "Cashier can view sale items" ON sale_items
    FOR SELECT USING (public.is_cashier());

CREATE POLICY "Cashier can create sale items" ON sale_items
    FOR INSERT WITH CHECK (public.is_cashier());

-- Admin-only tables: remove broad authenticated read
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Authenticated users can view purchases" ON purchases;
DROP POLICY IF EXISTS "Authenticated users can view purchase items" ON purchase_items;

CREATE POLICY "Admin can view suppliers" ON suppliers
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin can view purchases" ON purchases
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admin can view purchase items" ON purchase_items
    FOR SELECT USING (public.is_admin());
