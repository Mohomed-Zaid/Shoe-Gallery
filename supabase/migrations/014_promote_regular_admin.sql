-- Grant full business-administration access to this account.
-- Subscription management remains separately restricted to the super-admin email
-- in both the React navigation/route and the PostgreSQL subscription RPCs.
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = 'admin@gmail.com';

-- Business-table RLS recognizes both the super admin and designated regular admin.
-- This does not grant access to subscription RPCs, which independently verify only
-- zaidn2848@gmail.com.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    lower(coalesce(auth.jwt() ->> 'email', '')) IN (
      'zaidn2848@gmail.com',
      'admin@gmail.com'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    );
$$;
