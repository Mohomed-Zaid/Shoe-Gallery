-- Complete transactional Purchase Management module.
CREATE SEQUENCE IF NOT EXISTS public.purchase_number_seq START 1;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS purchase_number TEXT,
  ADD COLUMN IF NOT EXISTS supplier_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_by_email TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

UPDATE public.purchases
SET purchase_number = 'PUR-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0')
WHERE purchase_number IS NULL;
UPDATE public.purchases SET subtotal=total_amount, balance_amount=greatest(total_amount-paid_amount,0)
WHERE subtotal=0 AND total_amount<>0;
UPDATE public.purchases
SET payment_status = CASE
  WHEN paid_amount >= total_amount AND total_amount > 0 THEN 'paid'
  WHEN paid_amount > 0 THEN 'partial'
  ELSE 'unpaid'
END
WHERE payment_status NOT IN ('paid','partial','unpaid');
CREATE UNIQUE INDEX IF NOT EXISTS purchases_purchase_number_key ON public.purchases(purchase_number);
ALTER TABLE public.purchases ALTER COLUMN purchase_number SET NOT NULL;
ALTER TABLE public.purchases ALTER COLUMN payment_status SET DEFAULT 'unpaid';
CREATE INDEX IF NOT EXISTS purchases_supplier_date_idx ON public.purchases(supplier_id,purchase_date DESC);
CREATE INDEX IF NOT EXISTS purchases_payment_status_idx ON public.purchases(payment_status);

ALTER TABLE public.purchase_items
  ALTER COLUMN purchase_id SET NOT NULL,
  ALTER COLUMN variant_id SET NOT NULL,
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS line_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS update_selling_price BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.purchase_items SET line_total=quantity*cost_price-line_discount WHERE line_total=0;

ALTER TABLE public.inventory_history
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.purchase_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id UUID NOT NULL REFERENCES public.purchases(id),
  action TEXT NOT NULL, reason TEXT, changed_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchases_payment_status_check') THEN
    ALTER TABLE public.purchases ADD CONSTRAINT purchases_payment_status_check CHECK (payment_status IN ('paid','partial','unpaid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchases_status_check') THEN
    ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check CHECK (status IN ('draft','completed','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchases_amounts_check') THEN
    ALTER TABLE public.purchases ADD CONSTRAINT purchases_amounts_check CHECK (paid_amount>=0 AND balance_amount>=0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchase_items_values_check') THEN
    ALTER TABLE public.purchase_items ADD CONSTRAINT purchase_items_values_check CHECK (quantity>0 AND cost_price>=0 AND line_discount>=0 AND line_total>=0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_purchase_number() RETURNS TEXT
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT 'PUR-' || lpad(nextval('public.purchase_number_seq')::text,6,'0');
$$;
REVOKE ALL ON FUNCTION public.next_purchase_number() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.save_purchase(p_payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_id UUID := nullif(p_payload->>'id','')::uuid; v_supplier UUID := (p_payload->>'supplier_id')::uuid;
  v_status TEXT := coalesce(p_payload->>'status','completed'); v_number TEXT; v_subtotal NUMERIC(12,2):=0;
  v_total NUMERIC(12,2); v_paid NUMERIC(12,2):=coalesce((p_payload->>'paid_amount')::numeric,0);
  v_item JSONB; v_variant public.product_variants%ROWTYPE; v_line NUMERIC(12,2); v_existing public.purchases%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF v_supplier IS NULL THEN RAISE EXCEPTION 'Supplier is required'; END IF;
  IF v_status NOT IN ('draft','completed') THEN RAISE EXCEPTION 'Invalid purchase status'; END IF;
  IF jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))=0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    IF (v_item->>'quantity')::int<=0 OR (v_item->>'cost_price')::numeric<0 THEN RAISE EXCEPTION 'Invalid item quantity or cost'; END IF;
    v_line := (v_item->>'quantity')::int*(v_item->>'cost_price')::numeric-coalesce((v_item->>'line_discount')::numeric,0);
    IF v_line<0 THEN RAISE EXCEPTION 'Line discount exceeds line value'; END IF;
    v_subtotal := v_subtotal + (v_item->>'quantity')::int*(v_item->>'cost_price')::numeric;
  END LOOP;
  v_total := v_subtotal-coalesce((p_payload->>'discount_amount')::numeric,0)+coalesce((p_payload->>'additional_cost')::numeric,0);
  IF v_total<0 OR v_paid>v_total THEN RAISE EXCEPTION 'Paid amount cannot exceed purchase total'; END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.purchases WHERE id=v_id FOR UPDATE;
    IF NOT FOUND OR v_existing.status<>'draft' THEN RAISE EXCEPTION 'Only draft purchases can be edited'; END IF;
    v_number:=v_existing.purchase_number;
    DELETE FROM public.purchase_items WHERE purchase_id=v_id;
    UPDATE public.purchases SET supplier_id=v_supplier, supplier_invoice_number=nullif(p_payload->>'supplier_invoice_number',''),
      purchase_date=coalesce((p_payload->>'purchase_date')::date,current_date), subtotal=v_subtotal,
      discount_amount=coalesce((p_payload->>'discount_amount')::numeric,0), additional_cost=coalesce((p_payload->>'additional_cost')::numeric,0),
      total_amount=v_total, paid_amount=v_paid, balance_amount=v_total-v_paid,
      payment_status=CASE WHEN v_paid=v_total THEN 'paid' WHEN v_paid>0 THEN 'partial' ELSE 'unpaid' END,
      payment_method=nullif(p_payload->>'payment_method',''), notes=nullif(p_payload->>'notes',''), status=v_status, updated_at=now()
    WHERE id=v_id;
  ELSE
    v_id:=gen_random_uuid(); v_number:=public.next_purchase_number();
    INSERT INTO public.purchases(id,purchase_number,supplier_id,supplier_invoice_number,purchase_date,subtotal,discount_amount,additional_cost,total_amount,paid_amount,balance_amount,payment_status,payment_method,notes,status,created_by,created_by_email)
    VALUES(v_id,v_number,v_supplier,nullif(p_payload->>'supplier_invoice_number',''),coalesce((p_payload->>'purchase_date')::date,current_date),v_subtotal,
      coalesce((p_payload->>'discount_amount')::numeric,0),coalesce((p_payload->>'additional_cost')::numeric,0),v_total,v_paid,v_total-v_paid,
      CASE WHEN v_paid=v_total THEN 'paid' WHEN v_paid>0 THEN 'partial' ELSE 'unpaid' END,nullif(p_payload->>'payment_method',''),nullif(p_payload->>'notes',''),v_status,auth.uid(),auth.jwt()->>'email');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    SELECT * INTO v_variant FROM public.product_variants WHERE id=(v_item->>'variant_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product variant not found'; END IF;
    v_line := (v_item->>'quantity')::int*(v_item->>'cost_price')::numeric-coalesce((v_item->>'line_discount')::numeric,0);
    INSERT INTO public.purchase_items(purchase_id,variant_id,quantity,cost_price,selling_price,line_discount,line_total,update_selling_price)
    VALUES(v_id,v_variant.id,(v_item->>'quantity')::int,(v_item->>'cost_price')::numeric,nullif(v_item->>'selling_price','')::numeric,
      coalesce((v_item->>'line_discount')::numeric,0),v_line,coalesce((v_item->>'update_selling_price')::boolean,false));
    IF v_status='completed' THEN
      UPDATE public.product_variants SET stock_quantity=v_variant.stock_quantity+(v_item->>'quantity')::int,
        cost_price=(v_item->>'cost_price')::numeric,
        selling_price=CASE WHEN coalesce((v_item->>'update_selling_price')::boolean,false) AND nullif(v_item->>'selling_price','') IS NOT NULL THEN (v_item->>'selling_price')::numeric ELSE selling_price END
      WHERE id=v_variant.id;
      INSERT INTO public.inventory_history(variant_id,change_type,reference_type,reference_id,quantity_changed,previous_quantity,new_quantity,reason,user_id)
      VALUES(v_variant.id,'purchase','purchase',v_id,(v_item->>'quantity')::int,v_variant.stock_quantity,v_variant.stock_quantity+(v_item->>'quantity')::int,'Stock added from purchase '||v_number,auth.uid());
    END IF;
  END LOOP;
  IF v_status='completed' AND v_paid>0 THEN
    IF nullif(p_payload->>'payment_method','') IS NULL THEN RAISE EXCEPTION 'Payment method is required when an amount is paid'; END IF;
    INSERT INTO public.supplier_payments(supplier_id,purchase_id,amount,payment_date,payment_method,notes,created_by)
    VALUES(v_supplier,v_id,v_paid,current_date,p_payload->>'payment_method','Initial purchase payment',auth.uid());
  END IF;
  INSERT INTO public.purchase_audit_logs(purchase_id,action,changed_by) VALUES(v_id,CASE WHEN v_status='draft' THEN 'draft_saved' ELSE 'completed' END,auth.uid());
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment(p_purchase_id UUID,p_amount NUMERIC,p_payment_method TEXT,p_reference_number TEXT DEFAULT NULL,p_notes TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.purchases%ROWTYPE; v_paid NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF p_amount<=0 OR nullif(btrim(p_payment_method),'') IS NULL THEN RAISE EXCEPTION 'Valid amount and payment method are required'; END IF;
  SELECT * INTO p FROM public.purchases WHERE id=p_purchase_id FOR UPDATE;
  IF NOT FOUND OR p.status<>'completed' THEN RAISE EXCEPTION 'Completed purchase not found'; END IF;
  v_paid:=p.paid_amount+p_amount; IF v_paid>p.total_amount THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
  UPDATE public.purchases SET paid_amount=v_paid,balance_amount=total_amount-v_paid,payment_status=CASE WHEN v_paid=total_amount THEN 'paid' ELSE 'partial' END,updated_at=now() WHERE id=p.id;
  INSERT INTO public.supplier_payments(supplier_id,purchase_id,amount,payment_date,payment_method,reference_number,notes,created_by)
  VALUES(p.supplier_id,p.id,p_amount,current_date,p_payment_method,nullif(p_reference_number,''),nullif(p_notes,''),auth.uid());
  INSERT INTO public.purchase_audit_logs(purchase_id,action,changed_by) VALUES(p.id,'payment_recorded',auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_purchase(p_purchase_id UUID,p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.purchases%ROWTYPE; i RECORD; v public.product_variants%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
  SELECT * INTO p FROM public.purchases WHERE id=p_purchase_id FOR UPDATE;
  IF NOT FOUND OR p.status<>'completed' THEN RAISE EXCEPTION 'Only completed purchases can be cancelled'; END IF;
  FOR i IN SELECT * FROM public.purchase_items WHERE purchase_id=p.id LOOP
    SELECT * INTO v FROM public.product_variants WHERE id=i.variant_id FOR UPDATE;
    IF v.stock_quantity<i.quantity THEN RAISE EXCEPTION 'Cannot cancel: insufficient stock for variant %',i.variant_id; END IF;
    UPDATE public.product_variants SET stock_quantity=v.stock_quantity-i.quantity WHERE id=v.id;
    INSERT INTO public.inventory_history(variant_id,change_type,reference_type,reference_id,quantity_changed,previous_quantity,new_quantity,reason,user_id)
    VALUES(v.id,'remove','purchase_cancellation',p.id,-i.quantity,v.stock_quantity,v.stock_quantity-i.quantity,'Purchase cancelled: '||p.purchase_number||' - '||btrim(p_reason),auth.uid());
  END LOOP;
  UPDATE public.purchases SET status='cancelled',cancellation_reason=btrim(p_reason),updated_at=now() WHERE id=p.id;
  INSERT INTO public.purchase_audit_logs(purchase_id,action,reason,changed_by) VALUES(p.id,'cancelled',btrim(p_reason),auth.uid());
END; $$;

ALTER TABLE public.purchase_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view purchases" ON public.purchases;
CREATE POLICY "Admins view purchases" ON public.purchases FOR SELECT TO authenticated USING(public.is_admin());
DROP POLICY IF EXISTS "Admins view purchase items" ON public.purchase_items;
CREATE POLICY "Admins view purchase items" ON public.purchase_items FOR SELECT TO authenticated USING(public.is_admin());
DROP POLICY IF EXISTS "Admins view supplier payments" ON public.supplier_payments;
CREATE POLICY "Admins view supplier payments" ON public.supplier_payments FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY "Admins view purchase audit" ON public.purchase_audit_logs FOR SELECT TO authenticated USING(public.is_admin());
REVOKE INSERT,UPDATE,DELETE ON public.purchases,public.purchase_items,public.supplier_payments,public.purchase_audit_logs FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase(JSONB),public.record_supplier_payment(UUID,NUMERIC,TEXT,TEXT,TEXT),public.cancel_purchase(UUID,TEXT) TO authenticated;
