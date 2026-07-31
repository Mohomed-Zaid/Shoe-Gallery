-- Allow users to create their own profile row (e.g. when added via dashboard before trigger ran)
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Backfill profiles for any auth users that don't have one yet
INSERT INTO public.profiles (id, full_name, email, role)
SELECT
    u.id,
    u.raw_user_meta_data->>'full_name',
    u.email,
    'cashier'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Make the first user an admin (update email if needed)
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'zaidn2848@gmail.com';
