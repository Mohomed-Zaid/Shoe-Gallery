-- Fix RLS to allow both admins AND cashiers to access relevant tables
CREATE OR REPLACE FUNCTION public.is_admin_or_cashier()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR role = 'cashier')
  );
$$;

-- Fix categories read access
DROP POLICY IF EXISTS "Cashier can view categories" ON categories;
CREATE POLICY "Admin and Cashier can view categories" ON categories
    FOR SELECT USING (public.is_admin_or_cashier());

-- Fix brands read access
DROP POLICY IF EXISTS "Cashier can view brands" ON brands;
CREATE POLICY "Admin and Cashier can view brands" ON brands
    FOR SELECT USING (public.is_admin_or_cashier());

-- Fix products read access
DROP POLICY IF EXISTS "Cashier can view products" ON products;
CREATE POLICY "Admin and Cashier can view products" ON products
    FOR SELECT USING (public.is_admin_or_cashier());

-- Fix product variants read access
DROP POLICY IF EXISTS "Cashier can view product variants" ON product_variants;
CREATE POLICY "Admin and Cashier can view product variants" ON product_variants
    FOR SELECT USING (public.is_admin_or_cashier());

-- Fix customers: allow both roles to view/manage
DROP POLICY IF EXISTS "Cashier can view customers" ON customers;
CREATE POLICY "Admin and Cashier can view customers" ON customers
    FOR SELECT USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Cashier can manage customers" ON customers;
CREATE POLICY "Admin and Cashier can insert customers" ON customers
    FOR INSERT WITH CHECK (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Cashier can update customers" ON customers;
CREATE POLICY "Admin and Cashier can update customers" ON customers
    FOR UPDATE USING (public.is_admin_or_cashier());

-- Fix sales: allow both roles to view/manage
DROP POLICY IF EXISTS "Cashier can view sales" ON sales;
CREATE POLICY "Admin and Cashier can view sales" ON sales
    FOR SELECT USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Cashier can create sales" ON sales;
CREATE POLICY "Admin and Cashier can create sales" ON sales
    FOR INSERT WITH CHECK (public.is_admin_or_cashier());

-- Fix sale items: allow both roles to view/manage
DROP POLICY IF EXISTS "Cashier can view sale items" ON sale_items;
CREATE POLICY "Admin and Cashier can view sale items" ON sale_items
    FOR SELECT USING (public.is_admin_or_cashier());

DROP POLICY IF EXISTS "Cashier can create sale items" ON sale_items;
CREATE POLICY "Admin and Cashier can create sale items" ON sale_items
    FOR INSERT WITH CHECK (public.is_admin_or_cashier());
