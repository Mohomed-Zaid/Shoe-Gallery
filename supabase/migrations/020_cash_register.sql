CREATE TABLE IF NOT EXISTS public.cash_register_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 opening_balance numeric(12,2) NOT NULL CHECK(opening_balance>=0), opening_time timestamptz NOT NULL DEFAULT now(), closing_time timestamptz,
 expected_cash numeric(12,2), actual_cash numeric(12,2), difference numeric(12,2), notes text,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_register_per_cashier ON public.cash_register_sessions(user_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_register_sessions_time ON public.cash_register_sessions(opening_time DESC);
CREATE TABLE IF NOT EXISTS public.cash_register_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.cash_register_sessions(id), user_id uuid NOT NULL REFERENCES public.profiles(id),
 amount numeric(12,2) NOT NULL CHECK(amount>0), description text NOT NULL, expense_time timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_register_expenses_session ON public.cash_register_expenses(session_id);
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.cash_register_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view allowed register sessions" ON public.cash_register_sessions FOR SELECT USING(public.is_admin() OR user_id=auth.uid());
CREATE POLICY "Users view allowed register expenses" ON public.cash_register_expenses FOR SELECT USING(public.is_admin() OR user_id=auth.uid());
CREATE POLICY "Users add own register expenses" ON public.cash_register_expenses FOR INSERT WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM cash_register_sessions s WHERE s.id=session_id AND s.user_id=auth.uid() AND s.status='open'));

CREATE OR REPLACE FUNCTION public.open_cash_register(p_opening_balance numeric,p_notes text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF; IF p_opening_balance<0 THEN RAISE EXCEPTION 'Opening balance cannot be negative'; END IF;
 IF EXISTS(SELECT 1 FROM cash_register_sessions WHERE user_id=auth.uid() AND status='open') THEN RAISE EXCEPTION 'You already have an open register'; END IF;
 INSERT INTO cash_register_sessions(user_id,opening_balance,notes) VALUES(auth.uid(),p_opening_balance,nullif(trim(p_notes),'')) RETURNING id INTO v_id; RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_cash_register_summary(p_session_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s cash_register_sessions%rowtype; v_role text; result jsonb; BEGIN
 SELECT role INTO v_role FROM profiles WHERE id=auth.uid();
 IF p_session_id IS NULL THEN SELECT * INTO s FROM cash_register_sessions WHERE user_id=auth.uid() AND status='open' ORDER BY opening_time DESC LIMIT 1;
 ELSE SELECT * INTO s FROM cash_register_sessions WHERE id=p_session_id AND (user_id=auth.uid() OR v_role='admin'); END IF;
 IF NOT FOUND THEN RETURN NULL; END IF;
 WITH payment_totals AS (SELECT coalesce(sum(amount) FILTER(WHERE payment_method='cash'),0) cash_sales,coalesce(sum(amount) FILTER(WHERE payment_method='card'),0) card_sales,coalesce(sum(amount) FILTER(WHERE payment_method='bank_transfer'),0) bank_sales FROM sale_payments WHERE received_by=s.user_id AND payment_date>=s.opening_time AND payment_date<coalesce(s.closing_time,now()+interval '1 second')),
 refunds AS (SELECT coalesce(sum(amount),0) cash_refunds FROM sale_refunds WHERE refunded_by=s.user_id AND refund_method='cash' AND refund_date>=s.opening_time AND refund_date<coalesce(s.closing_time,now()+interval '1 second')),
 expenses AS (SELECT coalesce(sum(amount),0) cash_expenses FROM cash_register_expenses WHERE session_id=s.id)
 SELECT to_jsonb(s)||to_jsonb(p)||to_jsonb(r)||to_jsonb(e)||jsonb_build_object('expected_cash_live',s.opening_balance+p.cash_sales-r.cash_refunds-e.cash_expenses,'cashier_name',coalesce(pr.full_name,pr.email,'Cashier')) INTO result FROM payment_totals p CROSS JOIN refunds r CROSS JOIN expenses e LEFT JOIN profiles pr ON pr.id=s.user_id;
 RETURN result; END $$;

CREATE OR REPLACE FUNCTION public.close_cash_register(p_session_id uuid,p_actual_cash numeric,p_notes text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s cash_register_sessions%rowtype; summary jsonb; expected numeric; BEGIN
 SELECT * INTO s FROM cash_register_sessions WHERE id=p_session_id AND user_id=auth.uid() AND status='open' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Open register not found'; END IF;
 IF p_actual_cash<0 THEN RAISE EXCEPTION 'Actual cash cannot be negative'; END IF; summary:=get_cash_register_summary(s.id); expected:=(summary->>'expected_cash_live')::numeric;
 UPDATE cash_register_sessions SET closing_time=now(),expected_cash=expected,actual_cash=p_actual_cash,difference=p_actual_cash-expected,notes=concat_ws(E'\n',notes,nullif(trim(p_notes),'')),status='closed' WHERE id=s.id;
 RETURN get_cash_register_summary(s.id); END $$;
REVOKE ALL ON FUNCTION public.open_cash_register(numeric,text) FROM public; GRANT EXECUTE ON FUNCTION public.open_cash_register(numeric,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_cash_register_summary(uuid) FROM public; GRANT EXECUTE ON FUNCTION public.get_cash_register_summary(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.close_cash_register(uuid,numeric,text) FROM public; GRANT EXECUTE ON FUNCTION public.close_cash_register(uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_open_register_for_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='completed' AND NOT EXISTS(SELECT 1 FROM cash_register_sessions WHERE user_id=coalesce(NEW.user_id,auth.uid()) AND status='open') THEN RAISE EXCEPTION 'Open the cash register before completing a sale'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS sales_require_open_register ON public.sales;
CREATE TRIGGER sales_require_open_register BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.require_open_register_for_sale();
