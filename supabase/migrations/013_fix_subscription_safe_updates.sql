-- Correct subscription RPCs for projects enforcing UPDATE statements with WHERE clauses.
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
