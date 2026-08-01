-- Correct the deployed regular-admin account and business permission check.
-- Subscription RPCs remain restricted separately to zaidn2848@gmail.com.
INSERT INTO public.profiles (id, full_name, email, role)
SELECT users.id, users.raw_user_meta_data ->> 'full_name', users.email, 'admin'
FROM auth.users AS users
WHERE lower(users.email) = 'admin@gmail.com'
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, role = 'admin';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
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

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
