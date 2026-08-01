-- Give the designated store administrator all regular admin permissions.
-- Subscription management remains independently restricted to the super-admin email.
INSERT INTO public.profiles (id, full_name, email, role)
SELECT
  users.id,
  users.raw_user_meta_data ->> 'full_name',
  users.email,
  'admin'
FROM auth.users AS users
WHERE lower(users.email) = 'admin@gmail.com'
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = 'admin';
