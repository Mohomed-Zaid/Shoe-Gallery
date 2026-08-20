-- Bank deposits are cash movements, not expenses or sales.
CREATE TABLE IF NOT EXISTS public.cash_register_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cash_register_id uuid NOT NULL REFERENCES public.cash_register_sessions(id),
 movement_type text NOT NULL CHECK (movement_type IN ('bank_deposit')),
 amount numeric(12,2) NOT NULL CHECK (amount > 0),
 bank_name text NOT NULL CHECK (btrim(bank_name) <> ''),
 reference text,
 notes text,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_register_movements_session ON public.cash_register_movements(cash_register_id,created_at);
CREATE INDEX IF NOT EXISTS idx_cash_register_movements_type_time ON public.cash_register_movements(movement_type,created_at DESC);
ALTER TABLE public.cash_register_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view allowed register movements" ON public.cash_register_movements FOR SELECT
 USING(public.is_admin() OR created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.cash_register_sessions s WHERE s.id=cash_register_id AND s.user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.get_cash_register_summary(p_session_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s cash_register_sessions%rowtype; v_role text; result jsonb; BEGIN
 SELECT role INTO v_role FROM profiles WHERE id=auth.uid();
 IF p_session_id IS NULL THEN SELECT * INTO s FROM cash_register_sessions WHERE user_id=auth.uid() AND status='open' ORDER BY opening_time DESC LIMIT 1;
 ELSE SELECT * INTO s FROM cash_register_sessions WHERE id=p_session_id AND (user_id=auth.uid() OR v_role='admin'); END IF;
 IF NOT FOUND THEN RETURN NULL; END IF;
 WITH payment_totals AS (SELECT coalesce(sum(amount) FILTER(WHERE payment_method='cash'),0) cash_sales,coalesce(sum(amount) FILTER(WHERE payment_method='card'),0) card_sales,coalesce(sum(amount) FILTER(WHERE payment_method='bank_transfer'),0) bank_sales FROM sale_payments WHERE received_by=s.user_id AND payment_date>=s.opening_time AND payment_date<coalesce(s.closing_time,now()+interval '1 second')),
 refunds AS (SELECT coalesce(sum(amount),0) cash_refunds FROM sale_refunds WHERE refunded_by=s.user_id AND refund_method='cash' AND refund_date>=s.opening_time AND refund_date<coalesce(s.closing_time,now()+interval '1 second')),
 expenses AS (SELECT coalesce(sum(amount),0) cash_expenses FROM cash_register_expenses WHERE session_id=s.id),
 deposits AS (SELECT coalesce(sum(amount),0) bank_deposits FROM cash_register_movements WHERE cash_register_id=s.id AND movement_type='bank_deposit')
 SELECT to_jsonb(s)||to_jsonb(p)||to_jsonb(r)||to_jsonb(e)||to_jsonb(d)||jsonb_build_object('expected_cash_live',s.opening_balance+p.cash_sales-r.cash_refunds-e.cash_expenses-d.bank_deposits,'cashier_name',coalesce(pr.full_name,pr.email,'Cashier')) INTO result FROM payment_totals p CROSS JOIN refunds r CROSS JOIN expenses e CROSS JOIN deposits d LEFT JOIN profiles pr ON pr.id=s.user_id;
 RETURN result; END $$;

CREATE OR REPLACE FUNCTION public.record_bank_deposit(p_session_id uuid,p_amount numeric,p_bank_name text,p_reference text DEFAULT NULL,p_notes text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s cash_register_sessions%rowtype; v_expected numeric; v_id uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Deposit amount must be greater than 0'; END IF;
 IF nullif(btrim(p_bank_name),'') IS NULL THEN RAISE EXCEPTION 'Bank is required'; END IF;
 SELECT * INTO s FROM cash_register_sessions WHERE id=p_session_id AND user_id=auth.uid() AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open register not found'; END IF;
 v_expected:=((get_cash_register_summary(s.id))->>'expected_cash_live')::numeric;
 IF p_amount>v_expected THEN RAISE EXCEPTION 'Bank deposit cannot exceed the current available cash balance.'; END IF;
 INSERT INTO cash_register_movements(cash_register_id,movement_type,amount,bank_name,reference,notes,created_by)
 VALUES(s.id,'bank_deposit',p_amount,btrim(p_bank_name),nullif(btrim(p_reference),''),nullif(btrim(p_notes),''),auth.uid()) RETURNING id INTO v_id;
 RETURN v_id; END $$;
REVOKE ALL ON FUNCTION public.record_bank_deposit(uuid,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_bank_deposit(uuid,numeric,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cashup_report(p_start_date date DEFAULT NULL,p_end_date date DEFAULT NULL,p_search text DEFAULT NULL,p_cashier_id uuid DEFAULT NULL,p_status text DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_sort text DEFAULT 'newest')RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH sessions AS(SELECT s.*,coalesce(pr.full_name,pr.email,'Cashier')cashier_name,'CS-'||upper(substr(replace(s.id::text,'-',''),1,8))cashup_number,coalesce(s.closing_time,now()+interval'1 second')session_end FROM public.cash_register_sessions s LEFT JOIN public.profiles pr ON pr.id=s.user_id WHERE(p_start_date IS NULL OR s.opening_time::date>=p_start_date)AND(p_end_date IS NULL OR s.opening_time::date<=p_end_date)AND(p_cashier_id IS NULL OR s.user_id=p_cashier_id)),
sale_items AS(SELECT si.sale_id,count(si.id)::int items,sum(si.quantity)::int quantity,sum(coalesce(si.line_subtotal,si.selling_price*si.quantity))gross,sum(coalesce(si.discount_amount,0))item_discount FROM public.sale_items si GROUP BY si.sale_id),
session_sales AS(SELECT ss.id session_id,count(sa.id)::int total_invoices,coalesce(sum(si.quantity),0)::int items_sold,coalesce(sum(si.quantity),0)::int quantity_sold,coalesce(sum(si.gross),0)gross_sales,coalesce(sum(coalesce(sa.discount_amount,0)),0)discounts,coalesce(sum(sa.total_amount),0)total_sales FROM sessions ss LEFT JOIN public.sales sa ON sa.user_id=ss.user_id AND sa.created_at>=ss.opening_time AND sa.created_at<ss.session_end AND sa.status IN('completed','partially_returned','fully_returned')LEFT JOIN sale_items si ON si.sale_id=sa.id GROUP BY ss.id),
payments AS(SELECT ss.id session_id,coalesce(sum(p.amount)FILTER(WHERE p.payment_method='cash'),0)cash_sales,coalesce(sum(p.amount)FILTER(WHERE p.payment_method='card'),0)card_sales,coalesce(sum(p.amount)FILTER(WHERE p.payment_method='bank_transfer'),0)bank_sales,coalesce(sum(p.amount)FILTER(WHERE p.payment_method NOT IN('cash','card','bank_transfer','credit')),0)other_sales FROM sessions ss LEFT JOIN public.sale_payments p ON p.received_by=ss.user_id AND p.payment_date>=ss.opening_time AND p.payment_date<ss.session_end GROUP BY ss.id),
sale_paid AS(SELECT ss.id session_id,sa.id sale_id,sa.total_amount,coalesce(sum(p.amount),0)paid FROM sessions ss JOIN public.sales sa ON sa.user_id=ss.user_id AND sa.created_at>=ss.opening_time AND sa.created_at<ss.session_end AND sa.status IN('completed','partially_returned','fully_returned')LEFT JOIN public.sale_payments p ON p.sale_id=sa.id GROUP BY ss.id,sa.id,sa.total_amount),credits AS(SELECT session_id,coalesce(sum(greatest(total_amount-paid,0)),0)credit_sales FROM sale_paid GROUP BY session_id),
refunds AS(SELECT ss.id session_id,coalesce(sum(r.amount)FILTER(WHERE r.refund_method='cash'),0)cash_refunds FROM sessions ss LEFT JOIN public.sale_refunds r ON r.refunded_by=ss.user_id AND r.refund_date>=ss.opening_time AND r.refund_date<ss.session_end GROUP BY ss.id),
expenses AS(SELECT ss.id session_id,coalesce(sum(e.amount),0)cash_expenses FROM sessions ss LEFT JOIN public.cash_register_expenses e ON e.session_id=ss.id GROUP BY ss.id),
deposits AS(SELECT ss.id session_id,coalesce(sum(m.amount),0)bank_deposits FROM sessions ss LEFT JOIN public.cash_register_movements m ON m.cash_register_id=ss.id AND m.movement_type='bank_deposit' GROUP BY ss.id),
rows0 AS(SELECT s.id session_id,s.cashup_number,s.user_id,s.cashier_name,s.opening_time,s.closing_time,s.opening_balance opening_cash,coalesce(v.total_invoices,0)total_invoices,coalesce(v.items_sold,0)items_sold,coalesce(v.gross_sales,0)gross_sales,coalesce(v.discounts,0)discounts,coalesce(v.total_sales,0)total_sales,p.cash_sales,p.card_sales,p.bank_sales,coalesce(c.credit_sales,0)credit_sales,p.other_sales,r.cash_refunds,e.cash_expenses,d.bank_deposits,s.opening_balance+p.cash_sales-r.cash_refunds-e.cash_expenses-d.bank_deposits expected_cash,s.actual_cash counted_cash,CASE WHEN s.actual_cash IS NULL THEN NULL ELSE s.actual_cash-(s.opening_balance+p.cash_sales-r.cash_refunds-e.cash_expenses-d.bank_deposits)END difference,s.status,CASE WHEN s.status='open'THEN'open'WHEN abs(s.actual_cash-(s.opening_balance+p.cash_sales-r.cash_refunds-e.cash_expenses-d.bank_deposits))<=.01 THEN'balanced'WHEN s.actual_cash-(s.opening_balance+p.cash_sales-r.cash_refunds-e.cash_expenses-d.bank_deposits)<0 THEN'short'ELSE'over'END difference_status,s.notes FROM sessions s JOIN session_sales v ON v.session_id=s.id JOIN payments p ON p.session_id=s.id LEFT JOIN credits c ON c.session_id=s.id JOIN refunds r ON r.session_id=s.id JOIN expenses e ON e.session_id=s.id JOIN deposits d ON d.session_id=s.id),
filtered AS(SELECT * FROM rows0 r WHERE(p_status IS NULL OR r.status=p_status OR r.difference_status=p_status)AND(nullif(btrim(p_search),'')IS NULL OR r.cashup_number ILIKE'%'||btrim(p_search)||'%'OR r.cashier_name ILIKE'%'||btrim(p_search)||'%'OR EXISTS(SELECT 1 FROM public.sales sa WHERE sa.user_id=r.user_id AND sa.created_at>=r.opening_time AND sa.created_at<coalesce(r.closing_time,now()+interval'1 second')AND sa.invoice_number ILIKE'%'||btrim(p_search)||'%'))),
summary AS(SELECT count(*)::int sessions,coalesce(sum(total_sales),0)total_sales,coalesce(sum(cash_sales),0)cash_sales,coalesce(sum(card_sales),0)card_sales,coalesce(sum(bank_sales),0)bank_sales,coalesce(sum(credit_sales),0)credit_sales,coalesce(sum(cash_expenses),0)cash_expenses,coalesce(sum(bank_deposits),0)bank_deposits,coalesce(sum(expected_cash),0)expected_cash,coalesce(sum(counted_cash),0)counted_cash,coalesce(sum(difference)FILTER(WHERE status='closed'),0)cash_difference FROM filtered),
daily AS(SELECT opening_time::date date,count(*)::int sessions,sum(total_sales)sales,sum(cash_sales)cash,sum(card_sales)card,sum(bank_sales)transfer,sum(credit_sales)credit,sum(expected_cash)expected_cash,coalesce(sum(counted_cash),0)counted_cash,coalesce(sum(difference),0)difference FROM filtered GROUP BY opening_time::date),cashiers AS(SELECT user_id::text key,cashier_name name,count(*)::int sessions,sum(total_invoices)::int invoices,sum(total_sales)sales,sum(cash_sales)cash_collected,coalesce(sum(difference),0)difference FROM filtered GROUP BY user_id,cashier_name),paged AS(SELECT * FROM filtered ORDER BY CASE WHEN p_sort='oldest'THEN opening_time END ASC,CASE WHEN p_sort='sales_desc'THEN total_sales END DESC,CASE WHEN p_sort='difference_asc'THEN difference END ASC,CASE WHEN p_sort='cashier_asc'THEN cashier_name END ASC,CASE WHEN p_sort='newest'OR p_sort IS NULL THEN opening_time END DESC,session_id LIMIT least(greatest(p_page_size,1),100)OFFSET(greatest(p_page,1)-1)*least(greatest(p_page_size,1),100))
SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(paged))FROM paged),'[]'::jsonb),'total',(SELECT count(*)FROM filtered),'summary',to_jsonb(summary),'daily',coalesce((SELECT jsonb_agg(to_jsonb(daily)ORDER BY date)FROM daily),'[]'::jsonb),'cashiers',coalesce((SELECT jsonb_agg(to_jsonb(cashiers)ORDER BY sales DESC)FROM cashiers),'[]'::jsonb))FROM summary;
$$;
