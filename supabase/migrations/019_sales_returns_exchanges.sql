-- Transactional sales returns and exchanges.
CREATE SEQUENCE IF NOT EXISTS public.sales_return_number_seq START 1;
CREATE OR REPLACE FUNCTION public.next_sales_return_number() RETURNS text LANGUAGE sql VOLATILE AS $$
 SELECT 'RET-'||lpad(nextval('public.sales_return_number_seq')::text,6,'0');
$$;

CREATE TABLE IF NOT EXISTS public.sales_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_number text UNIQUE NOT NULL DEFAULT public.next_sales_return_number(),
 sale_id uuid NOT NULL REFERENCES public.sales(id), customer_id uuid REFERENCES public.customers(id), return_date timestamptz NOT NULL DEFAULT now(),
 return_type text NOT NULL CHECK(return_type IN ('refund','size_exchange','colour_exchange','product_exchange','store_credit','no_refund','damaged_return')),
 reason text NOT NULL, notes text, refund_method text CHECK(refund_method IS NULL OR refund_method IN ('cash','card','bank_transfer','store_credit','original_payment_method','no_refund')),
 refund_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(refund_amount>=0), store_credit_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(store_credit_amount>=0),
 refund_reference text, replacement_sale_id uuid REFERENCES public.sales(id), additional_payment numeric(12,2) NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'completed' CHECK(status IN ('draft','pending','completed','cancelled')),
 created_by uuid REFERENCES auth.users(id), approved_by uuid REFERENCES auth.users(id), cancellation_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_return_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
 sale_item_id uuid NOT NULL REFERENCES public.sale_items(id), original_variant_id uuid REFERENCES public.product_variants(id), replacement_variant_id uuid REFERENCES public.product_variants(id),
 product_name text NOT NULL, barcode_number text, size text, colour text, quantity_returned integer NOT NULL CHECK(quantity_returned>0),
 original_quantity integer NOT NULL, previously_returned_quantity integer NOT NULL DEFAULT 0,
 cost_price_at_sale numeric(12,2), selling_price_at_sale numeric(12,2) NOT NULL, original_item_discount numeric(12,2) NOT NULL DEFAULT 0,
 return_unit_value numeric(12,2) NOT NULL, return_total numeric(12,2) NOT NULL CHECK(return_total>=0),
 return_condition text CHECK(return_condition IS NULL OR return_condition IN ('resellable','damaged','used','defective','wrong_size','wrong_colour','other')),
 restock_item boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sale_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL REFERENCES public.sales_returns(id), sale_id uuid NOT NULL REFERENCES public.sales(id),
 customer_id uuid REFERENCES public.customers(id), refund_method text NOT NULL, amount numeric(12,2) NOT NULL CHECK(amount>0), reference_number text,
 refunded_by uuid REFERENCES auth.users(id), refund_date timestamptz NOT NULL DEFAULT now(), notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.customer_store_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id), return_id uuid REFERENCES public.sales_returns(id),
 amount numeric(12,2) NOT NULL CHECK(amount<>0), balance numeric(12,2) NOT NULL CHECK(balance>=0), status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.return_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid REFERENCES public.sales_returns(id), sale_id uuid REFERENCES public.sales(id), action text NOT NULL,
 actor_id uuid REFERENCES auth.users(id), reason text, previous_values jsonb, new_values jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check CHECK(status IN ('held','completed','partially_returned','fully_returned','cancelled'));
ALTER TABLE public.inventory_history DROP CONSTRAINT IF EXISTS inventory_history_change_type_check;
ALTER TABLE public.inventory_history ADD CONSTRAINT inventory_history_change_type_check CHECK(change_type IN ('add','remove','purchase','sale','sales_return','exchange_out','return_reversal','exchange_reversal'));
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY; ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_refunds ENABLE ROW LEVEL SECURITY; ALTER TABLE public.customer_store_credits ENABLE ROW LEVEL SECURITY; ALTER TABLE public.return_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Return users view headers" ON public.sales_returns FOR SELECT USING(public.is_admin_or_cashier());
CREATE POLICY "Return users view items" ON public.sales_return_items FOR SELECT USING(public.is_admin_or_cashier());
CREATE POLICY "Return users view refunds" ON public.sale_refunds FOR SELECT USING(public.is_admin_or_cashier());
CREATE POLICY "Return users view credits" ON public.customer_store_credits FOR SELECT USING(public.is_admin_or_cashier());
CREATE POLICY "Admins view return audit" ON public.return_audit_log FOR SELECT USING(public.is_admin());
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON public.sales_returns(sale_id); CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON public.sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON public.sales_returns(return_date); CREATE INDEX IF NOT EXISTS idx_sales_returns_status ON public.sales_returns(status);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON public.sales_return_items(return_id); CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON public.sales_return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_variant ON public.sales_return_items(original_variant_id); CREATE INDEX IF NOT EXISTS idx_sale_refunds_return ON public.sale_refunds(return_id);

CREATE OR REPLACE FUNCTION public.complete_sales_return(p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_role text; v_sale sales%rowtype; v_return_id uuid; v_item jsonb; v_si sale_items%rowtype;
 v_prev int; v_qty int; v_unit numeric; v_basis numeric; v_total numeric:=0; v_paid numeric:=0; v_refund numeric:=coalesce((p_payload->>'refund_amount')::numeric,0);
 v_credit numeric:=coalesce((p_payload->>'store_credit_amount')::numeric,0); v_replacement product_variants%rowtype; v_old_stock int; v_all int; v_returned int;
BEGIN
 SELECT role INTO v_role FROM profiles WHERE id=v_user; IF v_role IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO v_sale FROM sales WHERE id=(p_payload->>'sale_id')::uuid FOR UPDATE;
 IF NOT FOUND OR v_sale.status NOT IN ('completed','partially_returned') THEN RAISE EXCEPTION 'Sale is not returnable'; END IF;
 IF jsonb_array_length(coalesce(p_payload->'items','[]'))=0 THEN RAISE EXCEPTION 'Select at least one item'; END IF;
 SELECT coalesce(sum(amount),0) INTO v_paid FROM sale_payments WHERE sale_id=v_sale.id;
 INSERT INTO sales_returns(sale_id,customer_id,return_type,reason,notes,refund_method,refund_amount,store_credit_amount,refund_reference,status,created_by,approved_by)
 VALUES(v_sale.id,v_sale.customer_id,p_payload->>'return_type',trim(p_payload->>'reason'),nullif(p_payload->>'notes',''),nullif(p_payload->>'refund_method',''),v_refund,v_credit,nullif(p_payload->>'refund_reference',''),'completed',v_user,CASE WHEN v_role='admin' THEN v_user ELSE NULL END) RETURNING id INTO v_return_id;
 FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
  SELECT * INTO v_si FROM sale_items WHERE id=(v_item->>'sale_item_id')::uuid AND sale_id=v_sale.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid sale item'; END IF; v_qty:=(v_item->>'quantity')::int;
  SELECT coalesce(sum(sri.quantity_returned),0) INTO v_prev FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id WHERE sri.sale_item_id=v_si.id AND sr.status='completed';
  IF v_qty<=0 OR v_qty>v_si.quantity-v_prev THEN RAISE EXCEPTION 'Return quantity exceeds remaining quantity'; END IF;
  SELECT coalesce(sum(coalesce(line_total,selling_price*quantity)),0) INTO v_basis FROM sale_items WHERE sale_id=v_sale.id;
  v_unit:=greatest((coalesce(v_si.line_total,v_si.selling_price*v_si.quantity)
   - CASE WHEN v_basis>0 THEN v_sale.invoice_discount_amount*coalesce(v_si.line_total,v_si.selling_price*v_si.quantity)/v_basis ELSE 0 END)/v_si.quantity,0);
  v_total:=v_total+v_unit*v_qty;
  INSERT INTO sales_return_items(return_id,sale_item_id,original_variant_id,replacement_variant_id,product_name,barcode_number,size,colour,quantity_returned,original_quantity,previously_returned_quantity,cost_price_at_sale,selling_price_at_sale,original_item_discount,return_unit_value,return_total,return_condition,restock_item)
  SELECT v_return_id,v_si.id,v_si.variant_id,nullif(v_item->>'replacement_variant_id','')::uuid,coalesce(p.name,v_si.product_name,v_si.product_name_snapshot,'Instant item'),pv.barcode_number,coalesce(pv.size,v_si.size_snapshot),coalesce(pv.color,v_si.color_snapshot),v_qty,v_si.quantity,v_prev,coalesce(v_si.cost_price_at_sale,v_si.cost_price),v_si.selling_price,v_si.discount_amount,v_unit,v_unit*v_qty,v_item->>'condition',coalesce((v_item->>'restock')::boolean,false)
  FROM (SELECT 1) z LEFT JOIN product_variants pv ON pv.id=v_si.variant_id LEFT JOIN products p ON p.id=pv.product_id;
  IF v_si.variant_id IS NOT NULL AND coalesce((v_item->>'restock')::boolean,false) THEN
   SELECT stock_quantity INTO v_old_stock FROM product_variants WHERE id=v_si.variant_id FOR UPDATE; UPDATE product_variants SET stock_quantity=stock_quantity+v_qty WHERE id=v_si.variant_id;
   INSERT INTO inventory_history(variant_id,change_type,quantity_changed,previous_quantity,new_quantity,reason,user_id) VALUES(v_si.variant_id,'sales_return',v_qty,v_old_stock,v_old_stock+v_qty,'Return '||v_return_id,v_user);
  END IF;
  IF nullif(v_item->>'replacement_variant_id','') IS NOT NULL THEN
   SELECT * INTO v_replacement FROM product_variants WHERE id=(v_item->>'replacement_variant_id')::uuid FOR UPDATE;
   IF v_replacement.stock_quantity<v_qty THEN RAISE EXCEPTION 'Insufficient replacement stock'; END IF;
   UPDATE product_variants SET stock_quantity=stock_quantity-v_qty WHERE id=v_replacement.id;
   INSERT INTO inventory_history(variant_id,change_type,quantity_changed,previous_quantity,new_quantity,reason,user_id) VALUES(v_replacement.id,'exchange_out',-v_qty,v_replacement.stock_quantity,v_replacement.stock_quantity-v_qty,'Exchange '||v_return_id,v_user);
  END IF;
 END LOOP;
 IF v_refund+v_credit>v_total+.01 THEN RAISE EXCEPTION 'Refund and credit exceed valid return value'; END IF;
 IF v_credit>0 AND v_sale.customer_id IS NULL THEN RAISE EXCEPTION 'Store credit requires a registered customer'; END IF;
 -- Returned value first reduces unpaid balance. Cash leaves the store only up to money actually received.
 IF v_refund>least(v_total,v_paid) THEN RAISE EXCEPTION 'Cannot refund more than the amount received'; END IF;
 IF v_refund>0 THEN
  IF p_payload->>'refund_method' IN ('card','bank_transfer') AND coalesce(p_payload->>'refund_reference','')='' THEN RAISE EXCEPTION 'Refund reference is required'; END IF;
  INSERT INTO sale_refunds(return_id,sale_id,customer_id,refund_method,amount,reference_number,refunded_by,notes) VALUES(v_return_id,v_sale.id,v_sale.customer_id,p_payload->>'refund_method',v_refund,nullif(p_payload->>'refund_reference',''),v_user,p_payload->>'notes');
 END IF;
 IF v_credit>0 THEN INSERT INTO customer_store_credits(customer_id,return_id,amount,balance) VALUES(v_sale.customer_id,v_return_id,v_credit,v_credit); END IF;
 -- Compatibility mirror for the existing sales-report RPC. Its refund_amount
 -- represents returned sales value, not the cash refund, avoiding double subtraction.
 INSERT INTO returns(id,sale_id,customer_id,return_type,refund_amount,store_credit_amount,created_by,created_at)
 VALUES(v_return_id,v_sale.id,v_sale.customer_id,p_payload->>'return_type',v_total,v_credit,v_user,now());
 INSERT INTO return_items(return_id,variant_id,quantity,reason)
 SELECT v_return_id,original_variant_id,quantity_returned,p_payload->>'reason' FROM sales_return_items WHERE return_id=v_return_id;
 UPDATE customers SET outstanding_balance=greatest(outstanding_balance-greatest(v_total-v_refund-v_credit,0),0) WHERE id=v_sale.customer_id;
 SELECT coalesce(sum(quantity),0) INTO v_all FROM sale_items WHERE sale_id=v_sale.id;
 SELECT coalesce(sum(sri.quantity_returned),0) INTO v_returned FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id JOIN sale_items si ON si.id=sri.sale_item_id WHERE si.sale_id=v_sale.id AND sr.status='completed';
 UPDATE sales SET status=CASE WHEN v_returned>=v_all THEN 'fully_returned' ELSE 'partially_returned' END WHERE id=v_sale.id;
 INSERT INTO return_audit_log(return_id,sale_id,action,actor_id,reason,new_values) VALUES(v_return_id,v_sale.id,'return_completed',v_user,p_payload->>'reason',p_payload);
 RETURN v_return_id;
END $$;
REVOKE ALL ON FUNCTION public.complete_sales_return(jsonb) FROM public; GRANT EXECUTE ON FUNCTION public.complete_sales_return(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_sales_return(p_return_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r sales_returns%rowtype; i record; old_stock int; total_qty int; returned_qty int;
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin permission required'; END IF; IF trim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
 SELECT * INTO r FROM sales_returns WHERE id=p_return_id FOR UPDATE; IF r.status<>'completed' THEN RAISE EXCEPTION 'Only completed returns can be cancelled'; END IF;
 FOR i IN SELECT * FROM sales_return_items WHERE return_id=r.id LOOP
  IF i.restock_item AND i.original_variant_id IS NOT NULL THEN SELECT stock_quantity INTO old_stock FROM product_variants WHERE id=i.original_variant_id FOR UPDATE; IF old_stock<i.quantity_returned THEN RAISE EXCEPTION 'Returned stock has already been sold'; END IF; UPDATE product_variants SET stock_quantity=stock_quantity-i.quantity_returned WHERE id=i.original_variant_id; END IF;
  IF i.replacement_variant_id IS NOT NULL THEN UPDATE product_variants SET stock_quantity=stock_quantity+i.quantity_returned WHERE id=i.replacement_variant_id; END IF;
 END LOOP;
 UPDATE sales_returns SET status='cancelled',cancellation_reason=p_reason,updated_at=now() WHERE id=r.id; UPDATE customer_store_credits SET status='cancelled',balance=0 WHERE return_id=r.id AND balance=amount; DELETE FROM returns WHERE id=r.id;
 SELECT coalesce(sum(quantity),0) INTO total_qty FROM sale_items WHERE sale_id=r.sale_id; SELECT coalesce(sum(sri.quantity_returned),0) INTO returned_qty FROM sales_return_items sri JOIN sales_returns sr ON sr.id=sri.return_id JOIN sale_items si ON si.id=sri.sale_item_id WHERE si.sale_id=r.sale_id AND sr.status='completed';
 UPDATE sales SET status=CASE WHEN returned_qty=0 THEN 'completed' WHEN returned_qty>=total_qty THEN 'fully_returned' ELSE 'partially_returned' END WHERE id=r.sale_id;
 INSERT INTO return_audit_log(return_id,sale_id,action,actor_id,reason) VALUES(r.id,r.sale_id,'return_cancelled',auth.uid(),p_reason);
END $$;
REVOKE ALL ON FUNCTION public.cancel_sales_return(uuid,text) FROM public; GRANT EXECUTE ON FUNCTION public.cancel_sales_return(uuid,text) TO authenticated;
