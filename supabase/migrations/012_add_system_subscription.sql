-- Secure singleton subscription and audit trail. All expiry decisions use database time.
CREATE TABLE IF NOT EXISTS public.system_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_payment_date TIMESTAMPTZ,
  next_payment_date TIMESTAMPTZ,
  suspended_reason TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A constant-expression unique index guarantees one row without adding a public API field.
CREATE UNIQUE INDEX IF NOT EXISTS system_subscription_singleton_idx
  ON public.system_subscription ((true));

INSERT INTO public.system_subscription
  (status, activated_at, expires_at, last_payment_date, next_payment_date)
SELECT 'active', now(), now() + interval '30 days', now(), now() + interval '30 days'
WHERE NOT EXISTS (SELECT 1 FROM public.system_subscription);

CREATE TABLE IF NOT EXISTS public.subscription_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('activated', 'renewed', 'suspended', 'reopened', 'custom_expiry_changed')),
  previous_status TEXT,
  new_status TEXT,
  previous_expiry TIMESTAMPTZ,
  new_expiry TIMESTAMPTZ,
  changed_by UUID,
  changed_by_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can view subscription audit logs" ON public.subscription_audit_logs;
CREATE POLICY "Super admin can view subscription audit logs"
  ON public.subscription_audit_logs FOR SELECT TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'zaidn2848@gmail.com');

-- There are intentionally no direct table policies for system_subscription.
-- Authenticated access is through the narrowly scoped functions below.
REVOKE ALL ON public.system_subscription FROM anon, authenticated;
REVOKE ALL ON public.subscription_audit_logs FROM anon, authenticated;
GRANT SELECT ON public.subscription_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.require_subscription_super_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF lower(coalesce(auth.jwt() ->> 'email', '')) <> 'zaidn2848@gmail.com' THEN
    RAISE EXCEPTION 'Super admin access required' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_subscription_super_admin() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_subscription_status()
RETURNS TABLE (
  status TEXT, activated_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  server_time TIMESTAMPTZ, days_remaining INTEGER,
  is_expired BOOLEAN, is_access_allowed BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.status, s.activated_at, s.expires_at, now(),
    greatest(0, ceil(extract(epoch FROM (s.expires_at - now())) / 86400.0))::integer,
    (now() >= s.expires_at),
    (s.status = 'active' AND now() < s.expires_at)
  FROM public.system_subscription AS s
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_details()
RETURNS TABLE (
  status TEXT, activated_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  server_time TIMESTAMPTZ, days_remaining INTEGER, is_expired BOOLEAN,
  is_access_allowed BOOLEAN, last_payment_date TIMESTAMPTZ,
  next_payment_date TIMESTAMPTZ, suspended_reason TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.require_subscription_super_admin();
  RETURN QUERY SELECT s.status, s.activated_at, s.expires_at, now(),
    greatest(0, ceil(extract(epoch FROM (s.expires_at - now())) / 86400.0))::integer,
    now() >= s.expires_at, s.status = 'active' AND now() < s.expires_at,
    s.last_payment_date, s.next_payment_date, s.suspended_reason
  FROM public.system_subscription s LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_subscription_audit(
  p_action TEXT, p_previous_status TEXT, p_new_status TEXT,
  p_previous_expiry TIMESTAMPTZ, p_new_expiry TIMESTAMPTZ, p_notes TEXT DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.subscription_audit_logs
    (action, previous_status, new_status, previous_expiry, new_expiry, changed_by, changed_by_email, notes)
  VALUES (p_action, p_previous_status, p_new_status, p_previous_expiry, p_new_expiry,
    auth.uid(), lower(auth.jwt() ->> 'email'), p_notes);
$$;
REVOKE ALL ON FUNCTION public.write_subscription_audit(TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.activate_subscription()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE old_row public.system_subscription%ROWTYPE; new_expiry TIMESTAMPTZ := now() + interval '30 days';
BEGIN
  PERFORM public.require_subscription_super_admin();
  SELECT * INTO old_row FROM public.system_subscription FOR UPDATE;
  UPDATE public.system_subscription SET status='active', activated_at=now(), expires_at=new_expiry,
    last_payment_date=now(), next_payment_date=new_expiry, suspended_reason=NULL,
    updated_by=auth.uid(), updated_at=now()
  WHERE id = old_row.id;
  PERFORM public.write_subscription_audit('activated', old_row.status, 'active', old_row.expires_at, new_expiry, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.renew_subscription()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE old_row public.system_subscription%ROWTYPE; new_expiry TIMESTAMPTZ;
BEGIN
  PERFORM public.require_subscription_super_admin();
  SELECT * INTO old_row FROM public.system_subscription FOR UPDATE;
  new_expiry := CASE WHEN old_row.expires_at > now() THEN old_row.expires_at + interval '30 days' ELSE now() + interval '30 days' END;
  UPDATE public.system_subscription SET status='active', expires_at=new_expiry, last_payment_date=now(),
    next_payment_date=new_expiry, suspended_reason=NULL, updated_by=auth.uid(), updated_at=now()
  WHERE id = old_row.id;
  PERFORM public.write_subscription_audit('renewed', old_row.status, 'active', old_row.expires_at, new_expiry, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.suspend_subscription(reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE old_row public.system_subscription%ROWTYPE;
BEGIN
  PERFORM public.require_subscription_super_admin();
  IF nullif(btrim(reason), '') IS NULL THEN RAISE EXCEPTION 'Suspension reason is required'; END IF;
  SELECT * INTO old_row FROM public.system_subscription FOR UPDATE;
  UPDATE public.system_subscription SET status='suspended', suspended_reason=btrim(reason), updated_by=auth.uid(), updated_at=now()
  WHERE id = old_row.id;
  PERFORM public.write_subscription_audit('suspended', old_row.status, 'suspended', old_row.expires_at, old_row.expires_at, btrim(reason));
END; $$;

CREATE OR REPLACE FUNCTION public.reopen_subscription()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE old_row public.system_subscription%ROWTYPE; new_expiry TIMESTAMPTZ;
BEGIN
  PERFORM public.require_subscription_super_admin();
  SELECT * INTO old_row FROM public.system_subscription FOR UPDATE;
  new_expiry := CASE WHEN old_row.expires_at <= now() THEN now() + interval '30 days' ELSE old_row.expires_at END;
  UPDATE public.system_subscription SET status='active', expires_at=new_expiry, next_payment_date=new_expiry,
    suspended_reason=NULL, updated_by=auth.uid(), updated_at=now()
  WHERE id = old_row.id;
  PERFORM public.write_subscription_audit('reopened', old_row.status, 'active', old_row.expires_at, new_expiry, NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.set_subscription_expiry(new_expiry TIMESTAMPTZ)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE old_row public.system_subscription%ROWTYPE; new_status TEXT;
BEGIN
  PERFORM public.require_subscription_super_admin();
  IF new_expiry IS NULL THEN RAISE EXCEPTION 'Expiry date is required'; END IF;
  SELECT * INTO old_row FROM public.system_subscription FOR UPDATE;
  new_status := CASE WHEN new_expiry <= now() THEN 'expired' ELSE old_row.status END;
  UPDATE public.system_subscription SET expires_at=new_expiry, next_payment_date=new_expiry,
    status=new_status, updated_by=auth.uid(), updated_at=now()
  WHERE id = old_row.id;
  PERFORM public.write_subscription_audit('custom_expiry_changed', old_row.status, new_status, old_row.expires_at, new_expiry, NULL);
END; $$;

REVOKE ALL ON FUNCTION public.get_subscription_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subscription_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_subscription() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_subscription() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suspend_subscription(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_subscription() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_subscription_expiry(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_subscription(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_subscription_expiry(TIMESTAMPTZ) TO authenticated;
