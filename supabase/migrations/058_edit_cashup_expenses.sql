-- Allow administrators to correct a cash expense from a cashup detail.
-- Closed-session totals are adjusted in the same transaction so register history
-- and cashup reporting remain consistent with the edited expense.
ALTER TABLE public.cash_register_expenses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_cash_register_expense(
  p_expense_id uuid,
  p_amount numeric,
  p_description text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense public.cash_register_expenses%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_new_expected numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can edit cashup expenses';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than 0';
  END IF;
  IF nullif(btrim(p_description), '') IS NULL THEN
    RAISE EXCEPTION 'Description is required';
  END IF;

  SELECT * INTO v_expense
  FROM public.cash_register_expenses
  WHERE id = p_expense_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash expense not found';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_register_sessions
  WHERE id = v_expense.session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash register session not found';
  END IF;

  UPDATE public.cash_register_expenses
  SET amount = p_amount,
      description = btrim(p_description),
      updated_at = now()
  WHERE id = p_expense_id;

  IF v_session.status = 'closed' THEN
    v_new_expected := coalesce(v_session.expected_cash, 0) + v_expense.amount - p_amount;
    UPDATE public.cash_register_sessions
    SET expected_cash = v_new_expected,
        difference = CASE
          WHEN actual_cash IS NULL THEN NULL
          ELSE actual_cash - v_new_expected
        END
    WHERE id = v_session.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_cash_register_expense(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_cash_register_expense(uuid, numeric, text) TO authenticated;
