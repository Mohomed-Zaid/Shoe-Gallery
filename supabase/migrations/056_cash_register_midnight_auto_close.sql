-- Keep every cash register session within one Asia/Colombo business day.
ALTER TABLE public.cash_register_sessions
  ADD COLUMN IF NOT EXISTS auto_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_by_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_register_sessions_closed_by_type_check'
      AND conrelid = 'public.cash_register_sessions'::regclass
  ) THEN
    ALTER TABLE public.cash_register_sessions
      ADD CONSTRAINT cash_register_sessions_closed_by_type_check
      CHECK (closed_by_type IS NULL OR closed_by_type IN ('manual', 'automatic'));
  END IF;
END $$;

UPDATE public.cash_register_sessions
SET closed_by_type = 'manual'
WHERE status = 'closed' AND closed_by_type IS NULL;

CREATE OR REPLACE FUNCTION public.cash_register_expected_cash(
  p_session_id uuid,
  p_until timestamptz
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT round(
    s.opening_balance
    + coalesce((
      SELECT sum(p.amount) FROM public.sale_payments p
      WHERE p.received_by = s.user_id AND p.payment_method = 'cash'
        AND p.payment_date >= s.opening_time AND p.payment_date < p_until
    ), 0)
    - coalesce((
      SELECT sum(r.amount) FROM public.sale_refunds r
      WHERE r.refunded_by = s.user_id AND r.refund_method = 'cash'
        AND r.refund_date >= s.opening_time AND r.refund_date < p_until
    ), 0)
    - coalesce((
      SELECT sum(e.amount) FROM public.cash_register_expenses e
      WHERE e.session_id = s.id AND e.expense_time < p_until
    ), 0)
    - coalesce((
      SELECT sum(m.amount) FROM public.cash_register_movements m
      WHERE m.cash_register_id = s.id AND m.movement_type = 'bank_deposit'
        AND m.created_at < p_until
    ), 0),
    2
  )
  FROM public.cash_register_sessions s
  WHERE s.id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.auto_close_expired_cash_register_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.cash_register_sessions%rowtype;
  v_cutoff timestamptz;
  v_expected numeric;
  v_closed_id uuid;
BEGIN
  SELECT * INTO v_session
  FROM public.cash_register_sessions
  WHERE user_id = p_user_id AND status = 'open'
  ORDER BY opening_time DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR (v_session.opening_time AT TIME ZONE 'Asia/Colombo')::date
    >= (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date THEN
    RETURN NULL;
  END IF;

  v_cutoff := (((v_session.opening_time AT TIME ZONE 'Asia/Colombo')::date + 1)::timestamp
    AT TIME ZONE 'Asia/Colombo');
  v_expected := public.cash_register_expected_cash(v_session.id, v_cutoff);

  UPDATE public.cash_register_sessions
  SET closing_time = v_cutoff,
      expected_cash = v_expected,
      actual_cash = NULL,
      difference = NULL,
      status = 'closed',
      auto_closed = true,
      closed_by_type = 'automatic'
  WHERE id = v_session.id AND status = 'open'
  RETURNING id INTO v_closed_id;

  RETURN v_closed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cash_register_expected_cash(uuid, timestamptz),
  public.auto_close_expired_cash_register_for_user(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_cash_register_summary(p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.cash_register_sessions%rowtype;
  v_role text;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  IF p_session_id IS NULL THEN
    PERFORM public.auto_close_expired_cash_register_for_user(auth.uid());
    SELECT * INTO s FROM public.cash_register_sessions
    WHERE user_id = auth.uid() AND status = 'open'
    ORDER BY opening_time DESC LIMIT 1;
  ELSE
    SELECT * INTO s FROM public.cash_register_sessions
    WHERE id = p_session_id AND (user_id = auth.uid() OR v_role = 'admin');
  END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;

  WITH payment_totals AS (
    SELECT coalesce(sum(amount) FILTER (WHERE payment_method = 'cash'), 0) cash_sales,
      coalesce(sum(amount) FILTER (WHERE payment_method = 'card'), 0) card_sales,
      coalesce(sum(amount) FILTER (WHERE payment_method = 'bank_transfer'), 0) bank_sales
    FROM public.sale_payments
    WHERE received_by = s.user_id AND payment_date >= s.opening_time
      AND payment_date < coalesce(s.closing_time, clock_timestamp() + interval '1 second')
  ), refunds AS (
    SELECT coalesce(sum(amount), 0) cash_refunds FROM public.sale_refunds
    WHERE refunded_by = s.user_id AND refund_method = 'cash'
      AND refund_date >= s.opening_time
      AND refund_date < coalesce(s.closing_time, clock_timestamp() + interval '1 second')
  ), expenses AS (
    SELECT coalesce(sum(amount), 0) cash_expenses
    FROM public.cash_register_expenses WHERE session_id = s.id
  ), deposits AS (
    SELECT coalesce(sum(amount), 0) bank_deposits
    FROM public.cash_register_movements
    WHERE cash_register_id = s.id AND movement_type = 'bank_deposit'
  )
  SELECT to_jsonb(s) || to_jsonb(p) || to_jsonb(r) || to_jsonb(e) || to_jsonb(d)
    || jsonb_build_object(
      'expected_cash_live', coalesce(s.expected_cash,
        s.opening_balance + p.cash_sales - r.cash_refunds - e.cash_expenses - d.bank_deposits),
      'cashier_name', coalesce(pr.full_name, pr.email, 'Cashier')
    )
  INTO result
  FROM payment_totals p CROSS JOIN refunds r CROSS JOIN expenses e CROSS JOIN deposits d
  LEFT JOIN public.profiles pr ON pr.id = s.user_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_current_cash_register()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_closed uuid;
  v_register jsonb;
  v_recent_auto boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_closed := public.auto_close_expired_cash_register_for_user(auth.uid());
  v_register := public.get_cash_register_summary(NULL);
  SELECT EXISTS (
    SELECT 1 FROM public.cash_register_sessions s
    WHERE s.user_id = auth.uid() AND s.auto_closed
      AND (s.closing_time AT TIME ZONE 'Asia/Colombo')::date
        = (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
  ) INTO v_recent_auto;
  RETURN jsonb_build_object(
    'register', v_register,
    'auto_closed', v_closed IS NOT NULL OR (v_register IS NULL AND v_recent_auto)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_close_expired_cash_registers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid;
  v_count integer := 0;
  v_is_admin boolean := public.is_admin();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  FOR v_user IN
    SELECT DISTINCT user_id FROM public.cash_register_sessions
    WHERE status = 'open'
      AND (opening_time AT TIME ZONE 'Asia/Colombo')::date
        < (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
      AND (v_is_admin OR user_id = auth.uid())
  LOOP
    IF public.auto_close_expired_cash_register_for_user(v_user) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_register(p_opening_balance numeric, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_opening_balance < 0 THEN RAISE EXCEPTION 'Opening balance cannot be negative'; END IF;
  PERFORM public.auto_close_expired_cash_register_for_user(auth.uid());
  IF EXISTS (SELECT 1 FROM public.cash_register_sessions WHERE user_id = auth.uid() AND status = 'open') THEN
    RAISE EXCEPTION 'You already have an open register';
  END IF;
  INSERT INTO public.cash_register_sessions(user_id, opening_balance, notes, auto_closed, closed_by_type)
  VALUES(auth.uid(), p_opening_balance, nullif(trim(p_notes), ''), false, NULL)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_register(p_session_id uuid, p_actual_cash numeric, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.cash_register_sessions%rowtype;
  expected numeric;
BEGIN
  PERFORM public.auto_close_expired_cash_register_for_user(auth.uid());
  SELECT * INTO s FROM public.cash_register_sessions
  WHERE id = p_session_id AND user_id = auth.uid() AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open register not found'; END IF;
  IF p_actual_cash < 0 THEN RAISE EXCEPTION 'Actual cash cannot be negative'; END IF;
  expected := public.cash_register_expected_cash(s.id, clock_timestamp() + interval '1 second');
  UPDATE public.cash_register_sessions
  SET closing_time = clock_timestamp(), expected_cash = expected,
    actual_cash = p_actual_cash, difference = p_actual_cash - expected,
    notes = concat_ws(E'\n', notes, nullif(trim(p_notes), '')),
    status = 'closed', auto_closed = false, closed_by_type = 'manual'
  WHERE id = s.id AND status = 'open';
  RETURN public.get_cash_register_summary(s.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bank_deposit(
  p_session_id uuid, p_amount numeric, p_bank_name text,
  p_reference text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.cash_register_sessions%rowtype;
  v_expected numeric;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Deposit amount must be greater than 0'; END IF;
  IF nullif(btrim(p_bank_name), '') IS NULL THEN RAISE EXCEPTION 'Bank is required'; END IF;
  PERFORM public.auto_close_expired_cash_register_for_user(auth.uid());
  SELECT * INTO s FROM public.cash_register_sessions
  WHERE id = p_session_id AND user_id = auth.uid() AND status = 'open'
    AND (opening_time AT TIME ZONE 'Asia/Colombo')::date
      = (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Previous cash register was automatically closed at midnight. Open a new cash register to continue.'; END IF;
  v_expected := public.cash_register_expected_cash(s.id, clock_timestamp() + interval '1 second');
  IF p_amount > v_expected THEN RAISE EXCEPTION 'Bank deposit cannot exceed the current available cash balance.'; END IF;
  INSERT INTO public.cash_register_movements(cash_register_id, movement_type, amount, bank_name, reference, notes, created_by)
  VALUES(s.id, 'bank_deposit', p_amount, btrim(p_bank_name), nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_open_register_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_user uuid := coalesce(NEW.user_id, auth.uid());
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM public.auto_close_expired_cash_register_for_user(v_user);
    IF NOT EXISTS (
      SELECT 1 FROM public.cash_register_sessions
      WHERE user_id = v_user AND status = 'open'
        AND (opening_time AT TIME ZONE 'Asia/Colombo')::date
          = (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
    ) THEN
      RAISE EXCEPTION 'Previous cash register was automatically closed at midnight. Open a new cash register to continue.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_current_register_for_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.auto_close_expired_cash_register_for_user(NEW.user_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_register_sessions
    WHERE id = NEW.session_id AND user_id = NEW.user_id AND status = 'open'
      AND (opening_time AT TIME ZONE 'Asia/Colombo')::date
        = (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
  ) THEN RAISE EXCEPTION 'Open a new cash register before recording a cash expense'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_current_register_for_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.received_by IS NOT NULL AND NEW.payment_method <> 'credit' THEN
    PERFORM public.auto_close_expired_cash_register_for_user(NEW.received_by);
    IF NOT EXISTS (
      SELECT 1 FROM public.cash_register_sessions
      WHERE user_id = NEW.received_by AND status = 'open'
        AND (opening_time AT TIME ZONE 'Asia/Colombo')::date
          = (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
    ) THEN RAISE EXCEPTION 'Open a new cash register before recording a customer payment'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_current_register_for_cash_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.refund_method = 'cash' OR (
    NEW.refund_method = 'original_payment_method' AND EXISTS (
      SELECT 1 FROM public.sales s WHERE s.id = NEW.sale_id AND s.payment_method = 'cash'
    )
  ) THEN
    PERFORM public.auto_close_expired_cash_register_for_user(NEW.refunded_by);
    IF NOT EXISTS (
      SELECT 1 FROM public.cash_register_sessions
      WHERE user_id = NEW.refunded_by AND status = 'open'
        AND (opening_time AT TIME ZONE 'Asia/Colombo')::date
          = (clock_timestamp() AT TIME ZONE 'Asia/Colombo')::date
    ) THEN RAISE EXCEPTION 'Open a new cash register before recording a cash refund'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_require_current_register ON public.cash_register_expenses;
CREATE TRIGGER expenses_require_current_register BEFORE INSERT ON public.cash_register_expenses
FOR EACH ROW EXECUTE FUNCTION public.require_current_register_for_expense();
DROP TRIGGER IF EXISTS payments_require_current_register ON public.sale_payments;
CREATE TRIGGER payments_require_current_register BEFORE INSERT ON public.sale_payments
FOR EACH ROW EXECUTE FUNCTION public.require_current_register_for_payment();
DROP TRIGGER IF EXISTS cash_refunds_require_current_register ON public.sale_refunds;
CREATE TRIGGER cash_refunds_require_current_register BEFORE INSERT ON public.sale_refunds
FOR EACH ROW EXECUTE FUNCTION public.require_current_register_for_cash_refund();

REVOKE ALL ON FUNCTION public.ensure_current_cash_register(),
  public.auto_close_expired_cash_registers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_current_cash_register(),
  public.auto_close_expired_cash_registers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_register_summary(uuid),
  public.open_cash_register(numeric, text), public.close_cash_register(uuid, numeric, text),
  public.record_bank_deposit(uuid, numeric, text, text, text) TO authenticated;
