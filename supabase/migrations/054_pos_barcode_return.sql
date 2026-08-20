-- Fast POS barcode-return lookup. Completion continues through complete_sales_return,
-- which owns stock, accounting, audit, refund, and duplicate-return handling.
CREATE OR REPLACE FUNCTION public.get_pos_return_candidates(p_barcode text)
RETURNS TABLE(
 sale_id uuid,sale_item_id uuid,invoice_number text,sold_at timestamptz,sale_status text,
 customer_id uuid,payment_method text,paid_amount numeric,variant_id uuid,product_name text,
 article text,size text,colour text,barcode_number text,current_stock integer,
 original_quantity integer,already_returned integer,available_quantity integer,
 return_unit_value numeric,cost_price_at_sale numeric,return_period_expired boolean,eligible boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
WITH matched AS (
 SELECT s.id sale_id,si.id sale_item_id,s.invoice_number,s.created_at sold_at,s.status sale_status,
  s.customer_id,coalesce(s.payment_method,'') payment_method,coalesce(s.paid_amount,0) paid_amount,
  pv.id variant_id,coalesce(p.name,si.product_name,si.product_name_snapshot,'Unknown Product') product_name,
  p.item_article article,coalesce(si.size_snapshot,pv.size) size,coalesce(si.color_snapshot,pv.color) colour,
  coalesce(si.barcode_number_snapshot,pv.barcode_number) barcode_number,coalesce(pv.stock_quantity,0)::integer current_stock,si.quantity::integer original_quantity,
  coalesce((SELECT sum(sri.quantity_returned) FROM public.sales_return_items sri JOIN public.sales_returns sr ON sr.id=sri.return_id WHERE sri.sale_item_id=si.id AND sr.status='completed'),0)::integer already_returned,
  greatest((coalesce(si.line_total,si.selling_price*si.quantity)
   - CASE WHEN coalesce((SELECT sum(coalesce(x.line_total,x.selling_price*x.quantity)) FROM public.sale_items x WHERE x.sale_id=s.id),0)>0
     THEN coalesce(s.invoice_discount_amount,0)*coalesce(si.line_total,si.selling_price*si.quantity)
      /(SELECT sum(coalesce(x.line_total,x.selling_price*x.quantity)) FROM public.sale_items x WHERE x.sale_id=s.id)
     ELSE 0 END)/si.quantity,0) return_unit_value,
  coalesce(si.cost_price_at_sale,si.cost_price) cost_price_at_sale,
  s.created_at < now()-interval '7 days' return_period_expired
 FROM public.sale_items si
 JOIN public.sales s ON s.id=si.sale_id
 JOIN public.product_variants pv ON pv.id=si.variant_id
 LEFT JOIN public.products p ON p.id=pv.product_id
 WHERE coalesce(si.barcode_number_snapshot,pv.barcode_number)=btrim(p_barcode) AND s.status IN('completed','partially_returned','fully_returned')
)
SELECT m.sale_id,m.sale_item_id,m.invoice_number,m.sold_at,m.sale_status,m.customer_id,m.payment_method,m.paid_amount,
 m.variant_id,m.product_name,m.article,m.size,m.colour,m.barcode_number,m.current_stock,m.original_quantity,m.already_returned,
 greatest(m.original_quantity-m.already_returned,0)::integer available_quantity,round(m.return_unit_value,2),m.cost_price_at_sale,
 m.return_period_expired,(m.sale_status IN('completed','partially_returned') AND NOT m.return_period_expired AND m.original_quantity>m.already_returned) eligible
FROM matched m ORDER BY eligible DESC,sold_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_pos_return_candidates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pos_return_candidates(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_sales_return_period() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sold_at timestamptz;
BEGIN
 SELECT created_at INTO v_sold_at FROM public.sales WHERE id=NEW.sale_id;
 IF v_sold_at < now()-interval '7 days' THEN RAISE EXCEPTION 'Return period has expired.'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_sales_return_period ON public.sales_returns;
CREATE TRIGGER enforce_sales_return_period BEFORE INSERT ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_return_period();