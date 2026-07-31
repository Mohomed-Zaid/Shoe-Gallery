-- Fix 500 errors caused by infinite recursion in profiles RLS policies.
-- Run this in Supabase Dashboard → SQL Editor.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Profiles: replace recursive FOR ALL policy
DROP POLICY IF EXISTS "Admin can manage profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can update profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can delete profiles" ON profiles;

CREATE POLICY "Admin can update profiles" ON profiles
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "Admin can delete profiles" ON profiles
    FOR DELETE USING (public.is_admin());

-- Other tables: use is_admin() instead of subquery on profiles
DROP POLICY IF EXISTS "Admin can manage categories" ON categories;
CREATE POLICY "Admin can manage categories" ON categories
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage brands" ON brands;
CREATE POLICY "Admin can manage brands" ON brands
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage products" ON products;
CREATE POLICY "Admin can manage products" ON products
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage product variants" ON product_variants;
CREATE POLICY "Admin can manage product variants" ON product_variants
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage suppliers" ON suppliers;
CREATE POLICY "Admin can manage suppliers" ON suppliers
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage customers" ON customers;
CREATE POLICY "Admin can manage customers" ON customers
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage purchases" ON purchases;
CREATE POLICY "Admin can manage purchases" ON purchases
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage purchase items" ON purchase_items;
CREATE POLICY "Admin can manage purchase items" ON purchase_items
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage sales" ON sales;
CREATE POLICY "Admin can manage sales" ON sales
    FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage sale items" ON sale_items;
CREATE POLICY "Admin can manage sale items" ON sale_items
    FOR ALL USING (public.is_admin());

-- Ensure your account has a profile and admin role
INSERT INTO public.profiles (id, full_name, email, role)
SELECT
    u.id,
    u.raw_user_meta_data->>'full_name',
    u.email,
    'admin'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email = 'zaidn2848@gmail.com';

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'zaidn2848@gmail.com';
