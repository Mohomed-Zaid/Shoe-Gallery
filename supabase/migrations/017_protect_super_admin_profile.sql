-- Make the designated super-admin profile immutable through table operations.
-- Authentication credentials remain managed securely by Supabase Auth.
CREATE OR REPLACE FUNCTION public.protect_super_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF lower(coalesce(OLD.email, '')) = 'zaidn2848@gmail.com' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The super-admin account cannot be deleted' USING ERRCODE = '42501';
    END IF;

    IF NEW.role <> 'admin' OR lower(coalesce(NEW.email, '')) <> 'zaidn2848@gmail.com' THEN
      RAISE EXCEPTION 'The super-admin email and admin role cannot be changed' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_super_admin_profile_trigger ON public.profiles;
CREATE TRIGGER protect_super_admin_profile_trigger
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_profile();

-- Correct the protected profile if it was previously downgraded.
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) = 'zaidn2848@gmail.com'
  AND role <> 'admin';
