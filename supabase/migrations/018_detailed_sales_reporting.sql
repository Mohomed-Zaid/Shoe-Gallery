-- Accurate, immutable sales reporting foundation.
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS cost_price_at_sale numeric(12,2);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS line_subtotal numeric(12,2);
UPDATE public.sale_items SET cost_price_at_sale=cost_price WHERE cost_price_at_sale IS NULL AND cost_price IS NOT NULL;
-- One-time fallback for legacy inventory rows that predate cost snapshots.
UPDATE public.sale_items si SET cost_price_at_sale=pv.cost_price
FROM public.product_variants pv
WHERE si.variant_id=pv.id AND si.cost_price_at_sale IS NULL AND coalesce(si.is_instant_sale,false)=false;
UPDATE public.sale_items SET line_subtotal=selling_price*quantity WHERE line_subtotal IS NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_discount_amount numeric(12,2) NOT NULL DEFAULT 0;
-- Older checkout versions stored item + invoice discount together on the sale.
UPDATE public.sales s SET invoice_discount_amount=greatest(s.discount_amount-coalesce((SELECT sum(si.discount_amount) FROM public.sale_items si WHERE si.sale_id=s.id),0),0)
WHERE s.invoice_discount_amount=0 AND s.discount_amount>0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'inventory';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS due_date date;

CREATE TABLE IF NOT EXISTS public.sale_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
 payment_method text NOT NULL CHECK(payment_method IN ('cash','card','bank_transfer','credit','other')),
 amount numeric(12,2) NOT NULL CHECK(amount>0), reference_number text, payment_date timestamptz NOT NULL DEFAULT now(),
 received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Report users view payments" ON public.sale_payments;
CREATE POLICY "Report users view payments" ON public.sale_payments FOR SELECT USING (public.is_admin_or_cashier());
DROP POLICY IF EXISTS "POS users create payments" ON public.sale_payments;
CREATE POLICY "POS users create payments" ON public.sale_payments FOR INSERT WITH CHECK (public.is_admin_or_cashier() AND (received_by=auth.uid() OR received_by IS NULL));

-- Backfill legacy payments once. Future checkout writes normalized payment rows.
INSERT INTO public.sale_payments(sale_id,payment_method,amount,payment_date,received_by,notes)
SELECT s.id, CASE WHEN s.payment_method IN ('cash','card','bank_transfer','credit','other') THEN s.payment_method ELSE 'other' END,
       s.paid_amount,s.created_at,s.user_id,'Legacy payment backfill'
FROM public.sales s WHERE s.paid_amount>0 AND NOT EXISTS(SELECT 1 FROM public.sale_payments p WHERE p.sale_id=s.id);

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON public.sale_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON public.product_variants(barcode_number);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_date ON public.sale_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON public.returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_created ON public.returns(created_at);

CREATE OR REPLACE FUNCTION public.get_sales_report(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; caller_role text; caller_id uuid:=auth.uid();
BEGIN
 SELECT role INTO caller_role FROM profiles WHERE id=caller_id;
 IF caller_role IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
 WITH params AS (
  SELECT ((p_filters->>'startDate')::date)::timestamptz d1, (((p_filters->>'endDate')::date+1)::timestamptz) d2
 ), return_totals AS (
  SELECT return_id,sum(quantity) total_qty FROM return_items GROUP BY return_id
 ), ri AS (
  SELECT r.sale_id, x.variant_id, x.quantity::int qty,
         r.refund_amount*x.quantity/nullif(t.total_qty,0) returned_value
  FROM returns r JOIN return_items x ON x.return_id=r.id JOIN return_totals t ON t.return_id=r.id
 ), ret AS (SELECT sale_id,variant_id,sum(qty)::int qty,sum(returned_value) returned_value FROM ri GROUP BY sale_id,variant_id),
 pay AS (SELECT sale_id,sum(amount) paid, max(payment_date) last_payment, string_agg(DISTINCT payment_method,', ') methods FROM sale_payments GROUP BY sale_id),
 item_base AS (
  SELECT si.id,si.sale_id,si.variant_id,si.quantity,si.selling_price,si.discount_amount,
   coalesce(si.is_instant_sale,false) is_instant_sale,
   coalesce(si.cost_price_at_sale,si.cost_price) historical_cost,
   coalesce(si.line_subtotal,si.selling_price*si.quantity) original_value,
   coalesce(ret.qty,0)::int returned_qty,coalesce(ret.returned_value,0) returned_value,
   coalesce(p.name,si.product_name,si.product_name_snapshot,'Unknown product') product_name,pv.barcode_number barcode,
   c.name category,b.name brand,coalesce(pv.size,si.size_snapshot) size,coalesce(pv.color,si.color_snapshot) colour,pv.stock_quantity current_stock
  FROM sale_items si LEFT JOIN product_variants pv ON pv.id=si.variant_id LEFT JOIN products p ON p.id=pv.product_id
  LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN ret ON ret.sale_id=si.sale_id AND ret.variant_id IS NOT DISTINCT FROM si.variant_id
 ), filtered_sales AS (
  SELECT s.*,coalesce(c.name,'Walk-in Customer') customer_name,c.phone customer_phone,coalesce(pr.full_name,pr.email,'Unknown') cashier_name,
   coalesce(pay.paid,0) amount_paid,coalesce(pay.methods,s.payment_method) payment_methods,pay.last_payment
  FROM sales s CROSS JOIN params x LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN profiles pr ON pr.id=s.user_id LEFT JOIN pay ON pay.sale_id=s.id
  WHERE s.created_at>=x.d1 AND s.created_at<x.d2 AND s.status<>'held' AND (caller_role='admin' OR s.user_id=caller_id)
   AND (coalesce(p_filters->>'invoice','')='' OR s.invoice_number ILIKE '%'||(p_filters->>'invoice')||'%')
   AND (coalesce(p_filters->>'customer','')='' OR c.name ILIKE '%'||(p_filters->>'customer')||'%')
   AND (coalesce(p_filters->>'phone','')='' OR c.phone ILIKE '%'||(p_filters->>'phone')||'%')
   AND (coalesce(p_filters->>'cashier','')='' OR pr.full_name ILIKE '%'||(p_filters->>'cashier')||'%')
   AND (coalesce(p_filters->>'status','')='' OR s.status=p_filters->>'status')
   AND (coalesce(p_filters->>'saleType','')='' OR s.sale_type=p_filters->>'saleType')
   AND (coalesce(p_filters->>'paymentMethod','')='' OR EXISTS(SELECT 1 FROM sale_payments pp WHERE pp.sale_id=s.id AND pp.payment_method=p_filters->>'paymentMethod'))
   AND (coalesce(p_filters->>'minTotal','')='' OR s.total_amount>=(p_filters->>'minTotal')::numeric)
   AND (coalesce(p_filters->>'maxTotal','')='' OR s.total_amount<=(p_filters->>'maxTotal')::numeric)
   AND NOT EXISTS(SELECT 1 WHERE (coalesce(p_filters->>'product','')<>'' OR coalesce(p_filters->>'category','')<>'' OR coalesce(p_filters->>'brand','')<>'' OR coalesce(p_filters->>'size','')<>'' OR coalesce(p_filters->>'colour','')<>'' OR coalesce(p_filters->>'barcode','')<>'') AND NOT EXISTS(SELECT 1 FROM item_base i WHERE i.sale_id=s.id AND (coalesce(p_filters->>'product','')='' OR i.product_name ILIKE '%'||(p_filters->>'product')||'%') AND (coalesce(p_filters->>'category','')='' OR i.category=p_filters->>'category') AND (coalesce(p_filters->>'brand','')='' OR i.brand=p_filters->>'brand') AND (coalesce(p_filters->>'size','')='' OR i.size=p_filters->>'size') AND (coalesce(p_filters->>'colour','')='' OR i.colour=p_filters->>'colour') AND (coalesce(p_filters->>'barcode','')='' OR i.barcode ILIKE '%'||(p_filters->>'barcode')||'%')))
 ), item_priced AS (
  SELECT i.*,s.status,s.invoice_discount_amount,
   greatest(i.original_value-i.discount_amount,0) after_item_discount,
   sum(greatest(i.original_value-i.discount_amount,0)) OVER (PARTITION BY i.sale_id) invoice_discount_basis
  FROM item_base i JOIN filtered_sales s ON s.id=i.sale_id
 ), item_rows AS (
  SELECT i.*, greatest(i.quantity-i.returned_qty,0) net_qty,
   CASE WHEN i.invoice_discount_basis>0 THEN i.invoice_discount_amount*i.after_item_discount/i.invoice_discount_basis ELSE 0 END invoice_discount_share,
   CASE WHEN i.status='cancelled' THEN 0 ELSE greatest(
    i.after_item_discount
    - CASE WHEN i.invoice_discount_basis>0 THEN i.invoice_discount_amount*i.after_item_discount/i.invoice_discount_basis ELSE 0 END
    - i.returned_value,0) END net_revenue,
   CASE WHEN i.historical_cost IS NULL THEN NULL WHEN i.status='cancelled' THEN 0 ELSE i.historical_cost*greatest(i.quantity-i.returned_qty,0) END cost_total
  FROM item_priced i
 ), ia AS (
  SELECT sale_id,count(*) items,sum(quantity)::int qty,sum(original_value) gross,sum(discount_amount) item_disc,sum(returned_value) returned,
   sum(net_revenue) net_lines, CASE WHEN bool_or(historical_cost IS NULL AND net_qty>0) THEN NULL ELSE sum(cost_total) END cost
  FROM item_rows GROUP BY sale_id
 ), invoices AS (
  SELECT s.*,ia.items,ia.qty,ia.gross,ia.item_disc,ia.returned,
   CASE WHEN s.status='cancelled' THEN 0 ELSE ia.net_lines END net,
   CASE WHEN s.status='cancelled' THEN 0 ELSE ia.cost END cost,
   CASE WHEN s.status='cancelled' OR ia.cost IS NULL THEN NULL ELSE ia.net_lines-ia.cost END profit
  FROM filtered_sales s JOIN ia ON ia.sale_id=s.id
 ), active AS (SELECT * FROM invoices WHERE status<>'cancelled'),
 summary AS (SELECT count(*) total_invoices,count(*) FILTER(WHERE status='completed') completed_invoices,count(*) FILTER(WHERE status='cancelled') cancelled_invoices,
  coalesce(sum(qty) FILTER(WHERE status<>'cancelled'),0) total_quantity_sold,coalesce(sum(gross) FILTER(WHERE status<>'cancelled'),0) gross_sales,
  coalesce(sum(invoice_discount_amount) FILTER(WHERE status<>'cancelled'),0) invoice_discounts,coalesce(sum(item_disc) FILTER(WHERE status<>'cancelled'),0) item_discounts,
  coalesce(sum(returned) FILTER(WHERE status<>'cancelled'),0) returned_amount,coalesce(sum(net) FILTER(WHERE status<>'cancelled'),0) net_sales,
  CASE WHEN bool_or(cost IS NULL AND status<>'cancelled') THEN NULL ELSE coalesce(sum(cost) FILTER(WHERE status<>'cancelled'),0) END cost_of_goods,
  CASE WHEN bool_or(profit IS NULL AND status<>'cancelled') THEN NULL ELSE coalesce(sum(profit) FILTER(WHERE status<>'cancelled'),0) END gross_profit,
  coalesce(sum(amount_paid) FILTER(WHERE status<>'cancelled'),0) amount_received,coalesce(sum(greatest(net-amount_paid,0)) FILTER(WHERE status<>'cancelled'),0) outstanding_amount,
  count(DISTINCT customer_id) FILTER(WHERE status<>'cancelled' AND customer_id IS NOT NULL) unique_customers FROM invoices
 )
 SELECT jsonb_build_object(
  'summary',(SELECT to_jsonb(z)||jsonb_build_object('gross_profit_margin',CASE WHEN net_sales=0 OR gross_profit IS NULL THEN NULL ELSE gross_profit/net_sales*100 END,'average_invoice_value',CASE WHEN completed_invoices=0 THEN 0 ELSE net_sales/completed_invoices END,
   'cash_sales',coalesce((SELECT sum(amount) FROM sale_payments p JOIN active a ON a.id=p.sale_id WHERE p.payment_method='cash'),0),'card_sales',coalesce((SELECT sum(amount) FROM sale_payments p JOIN active a ON a.id=p.sale_id WHERE p.payment_method='card'),0),'bank_transfer_sales',coalesce((SELECT sum(amount) FROM sale_payments p JOIN active a ON a.id=p.sale_id WHERE p.payment_method='bank_transfer'),0),'credit_sales',coalesce((SELECT sum(greatest(net-amount_paid,0)) FROM active),0),'inventory_sale_total',coalesce((SELECT sum(net_revenue) FROM item_rows WHERE NOT is_instant_sale),0),'instant_billing_total',coalesce((SELECT sum(net_revenue) FROM item_rows WHERE is_instant_sale),0),'missing_cost_items',(SELECT count(*) FROM item_rows WHERE is_instant_sale AND historical_cost IS NULL AND net_qty>0),'refunds_issued',coalesce((SELECT sum(refund_amount) FROM returns r JOIN active a ON a.id=r.sale_id),0)) FROM summary z),
  'invoices',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('invoice_number',coalesce(a.invoice_number,a.id::text),'created_at',a.created_at,'total_items',a.items,'total_quantity',a.qty,'gross_amount',a.gross,'item_discount',a.item_disc,'invoice_discount',a.invoice_discount_amount,'returned_amount',a.returned,'net_amount',a.net,'cost_of_goods',a.cost,'gross_profit',a.profit,'profit_margin',CASE WHEN a.net=0 OR a.profit IS NULL THEN NULL ELSE a.profit/a.net*100 END,'outstanding',greatest(a.net-a.amount_paid,0),'payment_method',a.payment_methods,'payment_status',CASE WHEN a.amount_paid<=0 THEN 'Unpaid' WHEN a.amount_paid<a.net THEN 'Partially Paid' ELSE 'Paid' END,'sale_type',CASE WHEN EXISTS(SELECT 1 FROM item_rows i WHERE i.sale_id=a.id AND i.is_instant_sale) AND EXISTS(SELECT 1 FROM item_rows i WHERE i.sale_id=a.id AND NOT i.is_instant_sale) THEN 'Mixed Sale' WHEN EXISTS(SELECT 1 FROM item_rows i WHERE i.sale_id=a.id AND i.is_instant_sale) THEN 'Instant Billing' ELSE 'Inventory Sale' END,
   'items',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'sale_id',i.sale_id,'product_name',i.product_name,'barcode',i.barcode,'category',i.category,'brand',i.brand,'size',i.size,'colour',i.colour,'item_type',CASE WHEN i.is_instant_sale THEN 'Instant Billing' ELSE 'Inventory' END,'quantity_sold',i.quantity,'quantity_returned',i.returned_qty,'net_quantity',i.net_qty,'cost_price',i.historical_cost,'selling_price',i.selling_price,'original_value',i.original_value,'discount',i.discount_amount+i.invoice_discount_share,'returned_value',i.returned_value,'net_revenue',i.net_revenue,'cost_total',i.cost_total,'profit',CASE WHEN i.cost_total IS NULL THEN NULL ELSE i.net_revenue-i.cost_total END,'profit_margin',CASE WHEN i.net_revenue=0 OR i.cost_total IS NULL THEN NULL ELSE (i.net_revenue-i.cost_total)/i.net_revenue*100 END,'current_stock',i.current_stock)) FROM item_rows i WHERE i.sale_id=a.id),'payments','[]'::jsonb,'returns','[]'::jsonb)) FROM invoices a), '[]'::jsonb),
  'products','[]'::jsonb,'customers','[]'::jsonb,'cashiers','[]'::jsonb,'categories','[]'::jsonb,'brands','[]'::jsonb,
  'payments',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('invoice_number',a.invoice_number,'received_by_name',pr.full_name)) FROM sale_payments p JOIN invoices a ON a.id=p.sale_id LEFT JOIN profiles pr ON pr.id=p.received_by WHERE a.status<>'cancelled'),'[]'::jsonb),
  'returns',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('invoice_number',a.invoice_number,'return_number','RET-'||left(r.id::text,8))) FROM returns r JOIN invoices a ON a.id=r.sale_id),'[]'::jsonb),
  'charts',jsonb_build_object('trend','[]'::jsonb,'payment','[]'::jsonb,'category','[]'::jsonb,'topProducts','[]'::jsonb,'cashier','[]'::jsonb),
  'store',coalesce((SELECT to_jsonb(s) FROM store_settings s LIMIT 1),'{}'::jsonb),'generated_at',now()) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_sales_report(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sales_report(jsonb) TO authenticated;
