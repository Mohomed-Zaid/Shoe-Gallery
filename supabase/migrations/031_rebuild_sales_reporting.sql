-- Clean Sales Report architecture. Business tables and records are untouched.
DROP FUNCTION IF EXISTS public.validate_sales_report_cardinality(jsonb);
DROP FUNCTION IF EXISTS public.get_sales_report(jsonb);

CREATE TABLE IF NOT EXISTS public.sales_report_role_permissions (
  role text NOT NULL,
  permission text NOT NULL CHECK (permission IN (
    'reports.sales.view', 'reports.sales.view_cost', 'reports.sales.view_profit',
    'reports.sales.export', 'reports.sales.print', 'reports.sales.view_all_cashiers'
  )),
  PRIMARY KEY (role, permission)
);

INSERT INTO public.sales_report_role_permissions(role, permission) VALUES
  ('admin','reports.sales.view'),('admin','reports.sales.view_cost'),('admin','reports.sales.view_profit'),
  ('admin','reports.sales.export'),('admin','reports.sales.print'),('admin','reports.sales.view_all_cashiers'),
  ('cashier','reports.sales.view')
ON CONFLICT DO NOTHING;

ALTER TABLE public.sales_report_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users read report permissions" ON public.sales_report_role_permissions;
CREATE POLICY "Authenticated users read report permissions" ON public.sales_report_role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_sales_report_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.sales_report_role_permissions rp ON rp.role=p.role
    WHERE p.id=auth.uid() AND rp.permission=p_permission
  );
$$;

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON public.sale_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_date ON public.sale_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale ON public.sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_date ON public.sales_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_sales_returns_status ON public.sales_returns(status);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode_number ON public.product_variants(barcode_number);

-- Natural item level: exactly one row per sale_items.id. Returns are aggregated first.
CREATE OR REPLACE FUNCTION public.sales_report_item_rows(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid, sale_id uuid, invoice_number text, sale_date timestamptz, customer_id uuid,
  customer_name text, customer_phone text, cashier_id uuid, cashier_name text, sale_status text,
  product_id uuid, variant_id uuid, product_name text, barcode text, category text, brand text,
  size text, colour text, item_type text, quantity_sold integer, quantity_returned integer,
  net_quantity integer, selling_price numeric, cost_price numeric, original_value numeric,
  item_discount numeric, invoice_discount numeric, discount numeric, returned_value numeric,
  net_revenue numeric, cost_total numeric, profit numeric, profit_margin numeric, current_stock integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH params AS (
    SELECT coalesce((p_filters->>'startDate')::date,(now() AT TIME ZONE 'Asia/Colombo')::date)::timestamp AT TIME ZONE 'Asia/Colombo' d1,
           (coalesce((p_filters->>'endDate')::date,(now() AT TIME ZONE 'Asia/Colombo')::date)+1)::timestamp AT TIME ZONE 'Asia/Colombo' d2
  ), canonical_returns AS (
    SELECT sri.sale_item_id,
      sum(sri.quantity_returned)::integer returned_quantity,
      sum(sri.return_total) returned_value
    FROM public.sales_return_items sri
    JOIN public.sales_returns sr ON sr.id=sri.return_id AND sr.status='completed'
    GROUP BY sri.sale_item_id
  ), legacy_return_totals AS (
    SELECT ri.return_id,sum(ri.quantity)::numeric total_quantity
    FROM public.return_items ri JOIN public.returns r ON r.id=ri.return_id
    WHERE NOT EXISTS(SELECT 1 FROM public.sales_returns sr WHERE sr.id=r.id)
    GROUP BY ri.return_id
  ), legacy_by_variant AS (
    SELECT r.sale_id,ri.variant_id,sum(ri.quantity)::integer returned_quantity,
      sum(r.refund_amount*ri.quantity/nullif(t.total_quantity,0)) returned_value
    FROM public.returns r JOIN public.return_items ri ON ri.return_id=r.id
    JOIN legacy_return_totals t ON t.return_id=r.id
    WHERE NOT EXISTS(SELECT 1 FROM public.sales_returns sr WHERE sr.id=r.id)
    GROUP BY r.sale_id,ri.variant_id
  ), ranked_items AS (
    SELECT si.id,si.sale_id,si.variant_id,row_number() OVER(PARTITION BY si.sale_id,si.variant_id ORDER BY si.id) item_rank
    FROM public.sale_items si
  ), returns_by_item AS (
    SELECT x.sale_item_id,sum(x.returned_quantity)::integer returned_quantity,sum(x.returned_value) returned_value
    FROM (
      SELECT sale_item_id,returned_quantity,returned_value FROM canonical_returns
      UNION ALL
      SELECT i.id,l.returned_quantity,l.returned_value FROM legacy_by_variant l JOIN ranked_items i
        ON i.sale_id=l.sale_id AND i.variant_id IS NOT DISTINCT FROM l.variant_id AND i.item_rank=1
    ) x GROUP BY x.sale_item_id
  ), raw AS (
    SELECT si.id,si.sale_id,s.invoice_number,s.created_at sale_date,s.customer_id,
      coalesce(cu.name,'Walk-in Customer') customer_name,cu.phone customer_phone,s.user_id cashier_id,
      coalesce(pr.full_name,pr.email,'Unknown') cashier_name,s.status sale_status,
      pv.product_id,si.variant_id,coalesce(p.name,si.product_name,si.product_name_snapshot,'Unknown Product') product_name,
      coalesce(si.barcode_number_snapshot,pv.barcode_number) barcode,ca.name category,b.name brand,
      coalesce(si.size_snapshot,pv.size) size,coalesce(si.color_snapshot,pv.color) colour,
      CASE WHEN coalesce(si.is_instant_sale,false) THEN 'Instant Billing' ELSE 'Inventory' END item_type,
      si.quantity::integer quantity_sold,least(coalesce(rb.returned_quantity,0),si.quantity)::integer quantity_returned,
      greatest(si.quantity-least(coalesce(rb.returned_quantity,0),si.quantity),0)::integer net_quantity,
      si.selling_price,si.cost_price_at_sale historical_cost,
      coalesce(si.line_subtotal,si.selling_price*si.quantity) original_value,
      coalesce(si.discount_amount,0) item_discount,coalesce(rb.returned_value,0) returned_value,
      coalesce(s.invoice_discount_amount,0) invoice_discount_total,pv.stock_quantity current_stock,
      greatest(coalesce(si.line_subtotal,si.selling_price*si.quantity)-coalesce(si.discount_amount,0),0) discount_basis,
      sum(greatest(coalesce(si.line_subtotal,si.selling_price*si.quantity)-coalesce(si.discount_amount,0),0)) OVER(PARTITION BY si.sale_id) invoice_basis
    FROM public.sale_items si
    JOIN public.sales s ON s.id=si.sale_id
    CROSS JOIN params x
    LEFT JOIN public.customers cu ON cu.id=s.customer_id
    LEFT JOIN public.profiles pr ON pr.id=s.user_id
    LEFT JOIN public.product_variants pv ON pv.id=si.variant_id
    LEFT JOIN public.products p ON p.id=pv.product_id
    LEFT JOIN public.categories ca ON ca.id=p.category_id
    LEFT JOIN public.brands b ON b.id=p.brand_id
    LEFT JOIN returns_by_item rb ON rb.sale_item_id=si.id
    WHERE public.has_sales_report_permission('reports.sales.view')
      AND s.created_at>=x.d1 AND s.created_at<x.d2 AND s.status<>'held'
      AND (public.has_sales_report_permission('reports.sales.view_all_cashiers') OR s.user_id=auth.uid())
      AND (coalesce(p_filters->>'invoice','')='' OR s.invoice_number ILIKE '%'||(p_filters->>'invoice')||'%')
      AND (coalesce(p_filters->>'customer','')='' OR cu.name ILIKE '%'||(p_filters->>'customer')||'%')
      AND (coalesce(p_filters->>'cashier','')='' OR coalesce(pr.full_name,pr.email,'') ILIKE '%'||(p_filters->>'cashier')||'%')
      AND (coalesce(p_filters->>'status','')='' OR s.status=p_filters->>'status')
      AND (coalesce(p_filters->>'paymentMethod','')='' OR EXISTS(SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id=s.id AND sp.payment_method=p_filters->>'paymentMethod'))
      AND (coalesce(p_filters->>'saleType','')='' OR
        CASE
          WHEN EXISTS(SELECT 1 FROM public.sale_items z WHERE z.sale_id=s.id AND coalesce(z.is_instant_sale,false))
           AND EXISTS(SELECT 1 FROM public.sale_items z WHERE z.sale_id=s.id AND NOT coalesce(z.is_instant_sale,false)) THEN 'mixed'
          WHEN EXISTS(SELECT 1 FROM public.sale_items z WHERE z.sale_id=s.id AND coalesce(z.is_instant_sale,false)) THEN 'instant'
          ELSE 'inventory' END = p_filters->>'saleType')
  ), priced AS (
    SELECT r.*,CASE WHEN r.invoice_basis>0 THEN r.invoice_discount_total*r.discount_basis/r.invoice_basis ELSE 0 END invoice_discount_share
    FROM raw r
  )
  SELECT p.id,p.sale_id,p.invoice_number,p.sale_date,p.customer_id,p.customer_name,p.customer_phone,p.cashier_id,p.cashier_name,p.sale_status,
    p.product_id,p.variant_id,p.product_name,p.barcode,p.category,p.brand,p.size,p.colour,p.item_type,p.quantity_sold,p.quantity_returned,p.net_quantity,
    p.selling_price,CASE WHEN public.has_sales_report_permission('reports.sales.view_cost') THEN p.historical_cost ELSE NULL END,p.original_value,p.item_discount,p.invoice_discount_share,
    p.item_discount+p.invoice_discount_share discount,p.returned_value,
    CASE WHEN p.sale_status='cancelled' THEN 0 ELSE greatest(p.original_value-p.item_discount-p.invoice_discount_share-p.returned_value,0) END net_revenue,
    CASE WHEN NOT public.has_sales_report_permission('reports.sales.view_cost') OR p.historical_cost IS NULL THEN NULL WHEN p.sale_status='cancelled' THEN 0 ELSE p.historical_cost*p.net_quantity END cost_total,
    CASE WHEN NOT public.has_sales_report_permission('reports.sales.view_profit') OR p.historical_cost IS NULL THEN NULL WHEN p.sale_status='cancelled' THEN NULL ELSE greatest(p.original_value-p.item_discount-p.invoice_discount_share-p.returned_value,0)-p.historical_cost*p.net_quantity END profit,
    CASE WHEN NOT public.has_sales_report_permission('reports.sales.view_profit') OR p.historical_cost IS NULL OR p.sale_status='cancelled' OR greatest(p.original_value-p.item_discount-p.invoice_discount_share-p.returned_value,0)=0 THEN NULL
      ELSE (greatest(p.original_value-p.item_discount-p.invoice_discount_share-p.returned_value,0)-p.historical_cost*p.net_quantity)/greatest(p.original_value-p.item_discount-p.invoice_discount_share-p.returned_value,0)*100 END profit_margin,
    p.current_stock
  FROM priced p
  WHERE (coalesce(p_filters->>'product','')='' OR p.product_name ILIKE '%'||(p_filters->>'product')||'%')
    AND (coalesce(p_filters->>'barcode','')='' OR coalesce(p.barcode,'') ILIKE '%'||(p_filters->>'barcode')||'%')
    AND (coalesce(p_filters->>'category','')='' OR coalesce(p.category,'') ILIKE '%'||(p_filters->>'category')||'%')
    AND (coalesce(p_filters->>'brand','')='' OR coalesce(p.brand,'') ILIKE '%'||(p_filters->>'brand')||'%')
    AND (coalesce(p_filters->>'size','')='' OR coalesce(p.size,'') ILIKE '%'||(p_filters->>'size')||'%')
    AND (coalesce(p_filters->>'colour','')='' OR coalesce(p.colour,'') ILIKE '%'||(p_filters->>'colour')||'%');
$$;

-- Natural invoice level: child datasets are reduced to one row per sale before joining.
CREATE OR REPLACE FUNCTION public.sales_report_invoice_rows(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid, invoice_number text, created_at timestamptz, customer_id uuid, customer_name text,
  customer_phone text, cashier_id uuid, cashier_name text, item_count integer, quantity_sold integer,
  quantity_returned integer, net_quantity integer, gross_sales numeric, item_discount numeric,
  invoice_discount numeric, total_discount numeric, returned_amount numeric, net_sales numeric,
  cost_of_goods numeric, gross_profit numeric, profit_margin numeric, amount_paid numeric,
  outstanding numeric, payment_method text, payment_status text, sale_type text, status text, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH items AS (SELECT * FROM public.sales_report_item_rows(p_filters)),
  item_totals AS (
    SELECT sale_id,count(*)::integer item_count,sum(quantity_sold)::integer quantity_sold,
      sum(quantity_returned)::integer quantity_returned,sum(net_quantity)::integer net_quantity,
      sum(original_value) gross_sales,sum(item_discount) item_discount,sum(invoice_discount) invoice_discount,
      sum(discount) total_discount,sum(returned_value) returned_amount,sum(net_revenue) net_sales,
      CASE WHEN bool_or(cost_total IS NULL AND net_quantity>0) THEN NULL ELSE sum(cost_total) END cost_of_goods,
      CASE WHEN bool_or(profit IS NULL AND net_quantity>0) THEN NULL ELSE sum(profit) END gross_profit,
      bool_or(item_type='Inventory') has_inventory,bool_or(item_type='Instant Billing') has_instant
    FROM items GROUP BY sale_id
  ), payments AS (
    SELECT p.sale_id,sum(p.amount) amount_paid,string_agg(DISTINCT p.payment_method,', ' ORDER BY p.payment_method) methods
    FROM public.sale_payments p JOIN item_totals i ON i.sale_id=p.sale_id GROUP BY p.sale_id
  )
  SELECT s.id,coalesce(s.invoice_number,s.id::text),s.created_at,s.customer_id,
    coalesce(cu.name,'Walk-in Customer'),cu.phone,s.user_id,coalesce(pr.full_name,pr.email,'Unknown'),
    i.item_count,i.quantity_sold,i.quantity_returned,i.net_quantity,i.gross_sales,
    i.item_discount,i.invoice_discount,i.total_discount,i.returned_amount,i.net_sales,i.cost_of_goods,i.gross_profit,
    CASE WHEN i.net_sales=0 OR i.gross_profit IS NULL THEN NULL ELSE i.gross_profit/i.net_sales*100 END,
    coalesce(p.amount_paid,0),greatest(i.net_sales-coalesce(p.amount_paid,0),0),coalesce(p.methods,s.payment_method),
    CASE WHEN coalesce(p.amount_paid,0)<=0 THEN 'Unpaid' WHEN p.amount_paid<i.net_sales THEN 'Partially Paid' ELSE 'Paid' END,
    CASE WHEN i.has_inventory AND i.has_instant THEN 'Mixed Sale' WHEN i.has_instant THEN 'Instant Billing' ELSE 'Inventory Sale' END,
    s.status,s.notes
  FROM item_totals i
  JOIN public.sales s ON s.id=i.sale_id
  LEFT JOIN public.customers cu ON cu.id=s.customer_id
  LEFT JOIN public.profiles pr ON pr.id=s.user_id
  LEFT JOIN payments p ON p.sale_id=s.id
  WHERE (coalesce(p_filters->>'minTotal','')='' OR i.net_sales>=(p_filters->>'minTotal')::numeric)
    AND (coalesce(p_filters->>'maxTotal','')='' OR i.net_sales<=(p_filters->>'maxTotal')::numeric);
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_invoices(p_filters jsonb DEFAULT '{}'::jsonb,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_sort text DEFAULT 'newest')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH invoice_dataset AS (SELECT * FROM public.sales_report_invoice_rows(p_filters)), page_rows AS (
    SELECT * FROM invoice_dataset ORDER BY
      CASE WHEN p_sort='oldest' THEN created_at END ASC,
      CASE WHEN p_sort<>'oldest' THEN created_at END DESC,id DESC
    LIMIT least(greatest(p_page_size,1),10000) OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),10000)
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM page_rows x),'[]'::jsonb),'total',(SELECT count(*) FROM invoice_dataset));
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_items(p_filters jsonb DEFAULT '{}'::jsonb,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_sort text DEFAULT 'newest',p_sale_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH item_dataset AS (SELECT * FROM public.sales_report_item_rows(p_filters) x WHERE p_sale_id IS NULL OR x.sale_id=p_sale_id), page_rows AS (
    SELECT * FROM item_dataset ORDER BY CASE WHEN p_sort='oldest' THEN sale_date END ASC,CASE WHEN p_sort<>'oldest' THEN sale_date END DESC,id DESC
    LIMIT least(greatest(p_page_size,1),10000) OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),10000)
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM page_rows x),'[]'::jsonb),'total',(SELECT count(*) FROM item_dataset));
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_payments(p_filters jsonb DEFAULT '{}'::jsonb,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_sort text DEFAULT 'newest')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH eligible AS (SELECT DISTINCT sale_id FROM public.sales_report_item_rows(p_filters)), payment_dataset AS (
    SELECT p.id,p.sale_id,s.invoice_number,s.created_at sale_date,coalesce(c.name,'Walk-in Customer') customer_name,
      p.payment_method,p.amount,p.reference_number,coalesce(pr.full_name,pr.email,'Unknown') received_by,p.payment_date,p.notes
    FROM public.sale_payments p JOIN eligible e ON e.sale_id=p.sale_id JOIN public.sales s ON s.id=p.sale_id
    LEFT JOIN public.customers c ON c.id=s.customer_id LEFT JOIN public.profiles pr ON pr.id=p.received_by
    WHERE coalesce(p_filters->>'paymentMethod','')='' OR p.payment_method=p_filters->>'paymentMethod'
  ), page_rows AS (
    SELECT * FROM payment_dataset ORDER BY CASE WHEN p_sort='oldest' THEN payment_date END ASC,CASE WHEN p_sort<>'oldest' THEN payment_date END DESC,id DESC
    LIMIT least(greatest(p_page_size,1),10000) OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),10000)
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM page_rows x),'[]'::jsonb),'total',(SELECT count(*) FROM payment_dataset));
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_returns(p_filters jsonb DEFAULT '{}'::jsonb,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_sort text DEFAULT 'newest')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH eligible AS (SELECT DISTINCT sale_id FROM public.sales_report_item_rows(p_filters)), canonical_rows AS (
    SELECT sri.id,sr.id return_id,sr.return_number,sr.sale_id,s.invoice_number,sr.return_date,
      coalesce(c.name,'Walk-in Customer') customer_name,sri.product_name,sri.barcode_number,
      concat_ws(' / ',sri.size,sri.colour) variant,sri.quantity_returned,sri.return_total returned_value,
      CASE WHEN sum(sri.return_total) OVER(PARTITION BY sr.id)>0 THEN sr.refund_amount*sri.return_total/sum(sri.return_total) OVER(PARTITION BY sr.id) ELSE 0 END refund_amount,
      CASE WHEN sum(sri.return_total) OVER(PARTITION BY sr.id)>0 THEN sr.store_credit_amount*sri.return_total/sum(sri.return_total) OVER(PARTITION BY sr.id) ELSE 0 END store_credit_amount,
      sr.return_type,sr.reason,
      coalesce(pr.full_name,pr.email,'Unknown') processed_by,sr.status
    FROM public.sales_return_items sri JOIN public.sales_returns sr ON sr.id=sri.return_id
    JOIN eligible e ON e.sale_id=sr.sale_id JOIN public.sales s ON s.id=sr.sale_id
    LEFT JOIN public.customers c ON c.id=sr.customer_id LEFT JOIN public.profiles pr ON pr.id=sr.created_by
  ), legacy_rows AS (
    SELECT ri.id,r.id return_id,'RET-'||left(r.id::text,8) return_number,r.sale_id,s.invoice_number,r.created_at return_date,
      coalesce(c.name,'Walk-in Customer') customer_name,coalesce(p.name,'Unknown Product') product_name,pv.barcode_number,
      concat_ws(' / ',pv.size,pv.color) variant,ri.quantity::integer quantity_returned,
      r.refund_amount*ri.quantity/nullif(sum(ri.quantity) OVER(PARTITION BY r.id),0) returned_value,
      r.refund_amount*ri.quantity/nullif(sum(ri.quantity) OVER(PARTITION BY r.id),0) refund_amount,
      r.store_credit_amount*ri.quantity/nullif(sum(ri.quantity) OVER(PARTITION BY r.id),0) store_credit_amount,
      r.return_type,ri.reason,coalesce(pr.full_name,pr.email,'Unknown') processed_by,'completed'::text status
    FROM public.return_items ri JOIN public.returns r ON r.id=ri.return_id JOIN eligible e ON e.sale_id=r.sale_id
    JOIN public.sales s ON s.id=r.sale_id LEFT JOIN public.customers c ON c.id=r.customer_id
    LEFT JOIN public.profiles pr ON pr.id=r.created_by LEFT JOIN public.product_variants pv ON pv.id=ri.variant_id
    LEFT JOIN public.products p ON p.id=pv.product_id
    WHERE NOT EXISTS(SELECT 1 FROM public.sales_returns sr WHERE sr.id=r.id)
  ), return_dataset AS (
    SELECT * FROM canonical_rows UNION ALL SELECT * FROM legacy_rows
  ), page_rows AS (
    SELECT * FROM return_dataset ORDER BY CASE WHEN p_sort='oldest' THEN return_date END ASC,CASE WHEN p_sort<>'oldest' THEN return_date END DESC,id DESC
    LIMIT least(greatest(p_page_size,1),10000) OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),10000)
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM page_rows x),'[]'::jsonb),'total',(SELECT count(*) FROM return_dataset));
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_summary(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH invoices AS (SELECT * FROM public.sales_report_invoice_rows(p_filters)), active AS (SELECT * FROM invoices WHERE status<>'cancelled'),
  active_items AS (SELECT * FROM public.sales_report_item_rows(p_filters) WHERE sale_status<>'cancelled'),
  item_sales AS (
    SELECT coalesce(sum(net_revenue) FILTER(WHERE item_type='Inventory'),0) inventory_sales,
      coalesce(sum(net_revenue) FILTER(WHERE item_type='Instant Billing'),0) instant_billing_sales
    FROM active_items
  ),
  payment_totals AS (
    SELECT coalesce(sum(p.amount),0) amount_received,
      coalesce(sum(p.amount) FILTER(WHERE p.payment_method='cash'),0) cash_received,
      coalesce(sum(p.amount) FILTER(WHERE p.payment_method='card'),0) card_received,
      coalesce(sum(p.amount) FILTER(WHERE p.payment_method='bank_transfer'),0) bank_transfer_received
    FROM public.sale_payments p JOIN active a ON a.id=p.sale_id
  ), totals AS (
    SELECT count(*)::integer total_invoices,coalesce(sum(net_quantity),0)::integer total_quantity_sold,
      coalesce(sum(gross_sales),0) gross_sales,coalesce(sum(total_discount),0) total_discounts,
      coalesce(sum(returned_amount),0) returned_amount,coalesce(sum(net_sales),0) net_sales,
      CASE WHEN bool_or(cost_of_goods IS NULL AND net_quantity>0) THEN NULL ELSE coalesce(sum(cost_of_goods),0) END cost_of_goods,
      CASE WHEN bool_or(gross_profit IS NULL AND net_quantity>0) THEN NULL ELSE coalesce(sum(gross_profit),0) END gross_profit,
      coalesce(sum(outstanding),0) outstanding_amount,
      count(*) FILTER(WHERE status<>'cancelled')::integer completed_invoice_count
    FROM active
  )
  SELECT to_jsonb(t)||to_jsonb(p)||to_jsonb(i)||jsonb_build_object(
    'profit_margin',CASE WHEN t.net_sales=0 OR t.gross_profit IS NULL THEN NULL ELSE t.gross_profit/t.net_sales*100 END,
    'credit_sales',t.outstanding_amount,
    'average_invoice_value',CASE WHEN t.completed_invoice_count=0 THEN 0 ELSE t.net_sales/t.completed_invoice_count END
  ) FROM totals t CROSS JOIN payment_totals p CROSS JOIN item_sales i;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_breakdowns(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH items AS (SELECT * FROM public.sales_report_item_rows(p_filters) WHERE sale_status<>'cancelled'),
  invoices AS (SELECT * FROM public.sales_report_invoice_rows(p_filters) WHERE status<>'cancelled'),
  products AS (
    SELECT coalesce(product_id::text,'instant:'||product_name)||':'||coalesce(variant_id::text,coalesce(barcode,product_name)) id,product_name,barcode,size,colour,
      sum(quantity_sold)::integer quantity_sold,sum(quantity_returned)::integer quantity_returned,sum(net_quantity)::integer net_quantity,
      sum(original_value) gross_revenue,sum(discount) discounts,sum(returned_value) returned_value,sum(net_revenue) net_revenue,
      CASE WHEN bool_or(cost_total IS NULL AND net_quantity>0) THEN NULL ELSE sum(cost_total) END cost,
      CASE WHEN bool_or(profit IS NULL AND net_quantity>0) THEN NULL ELSE sum(profit) END profit,
      count(DISTINCT sale_id)::integer invoice_count,max(current_stock) current_stock
    FROM items GROUP BY product_id,variant_id,product_name,barcode,size,colour
  ), customers AS (
    SELECT coalesce(customer_id::text,'walk-in') id,customer_name,customer_phone,
      count(*)::integer invoice_count,sum(net_quantity)::integer quantity_purchased,sum(gross_sales) gross_sales,
      sum(total_discount) discounts,sum(returned_amount) returns,sum(net_sales) net_sales,sum(amount_paid) paid,
      sum(outstanding) outstanding,CASE WHEN bool_or(gross_profit IS NULL) THEN NULL ELSE sum(gross_profit) END profit,max(created_at) last_purchase_date
    FROM invoices GROUP BY customer_id,customer_name,customer_phone
  ), cashiers AS (
    SELECT cashier_id::text id,cashier_name,count(*)::integer invoice_count,sum(net_quantity)::integer quantity_sold,
      sum(gross_sales) gross_sales,sum(total_discount) discounts,sum(returned_amount) returns,sum(net_sales) net_sales,
      sum(amount_paid) amount_received,sum(outstanding) outstanding,
      CASE WHEN bool_or(cost_of_goods IS NULL) THEN NULL ELSE sum(cost_of_goods) END cost,
      CASE WHEN bool_or(gross_profit IS NULL) THEN NULL ELSE sum(gross_profit) END profit,
      CASE WHEN count(*)=0 THEN 0 ELSE sum(net_sales)/count(*) END average_invoice_value
    FROM invoices GROUP BY cashier_id,cashier_name
  ), categories AS (
    SELECT coalesce(category,'Uncategorized') name,sum(net_revenue) value FROM items GROUP BY category
  )
  SELECT jsonb_build_object(
    'products',coalesce((SELECT jsonb_agg(to_jsonb(x)||jsonb_build_object('profit_margin',CASE WHEN x.net_revenue=0 OR x.profit IS NULL THEN NULL ELSE x.profit/x.net_revenue*100 END) ORDER BY x.net_revenue DESC) FROM products x),'[]'::jsonb),
    'customers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.net_sales DESC) FROM customers x),'[]'::jsonb),
    'cashiers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.net_sales DESC) FROM cashiers x),'[]'::jsonb),
    'categories',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.value DESC) FROM categories x),'[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report_charts(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH items AS (SELECT * FROM public.sales_report_item_rows(p_filters) WHERE sale_status<>'cancelled'),
  span AS (SELECT greatest(1,(coalesce((p_filters->>'endDate')::date,current_date)-coalesce((p_filters->>'startDate')::date,current_date))) days),
  trend AS (
    SELECT CASE WHEN s.days<=1 THEN date_trunc('hour',i.sale_date) WHEN s.days<=31 THEN date_trunc('day',i.sale_date) ELSE date_trunc('month',i.sale_date) END period,
      sum(i.net_revenue) revenue,CASE WHEN bool_or(i.cost_total IS NULL) THEN NULL ELSE sum(i.cost_total) END cost,
      CASE WHEN bool_or(i.profit IS NULL) THEN NULL ELSE sum(i.profit) END profit,sum(i.net_quantity)::integer quantity
    FROM items i CROSS JOIN span s GROUP BY 1
  ), payment AS (
    SELECT p.payment_method name,sum(p.amount) value FROM public.sale_payments p JOIN (SELECT DISTINCT sale_id FROM items) i ON i.sale_id=p.sale_id GROUP BY p.payment_method
  ), top_selling AS (
    SELECT product_name name,sum(net_quantity)::integer value FROM items GROUP BY product_id,product_name ORDER BY value DESC LIMIT 10
  ), top_profit AS (
    SELECT product_name name,sum(profit) value FROM items WHERE profit IS NOT NULL GROUP BY product_id,product_name ORDER BY value DESC LIMIT 10
  ), category AS (
    SELECT coalesce(category,'Uncategorized') name,sum(net_revenue) value FROM items GROUP BY category ORDER BY value DESC
  )
  SELECT jsonb_build_object(
    'trend',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.period) FROM trend x),'[]'::jsonb),
    'payments',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.value DESC) FROM payment x),'[]'::jsonb),
    'topSelling',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM top_selling x),'[]'::jsonb),
    'topProfitable',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM top_profit x),'[]'::jsonb),
    'categories',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM category x),'[]'::jsonb)
  );
$$;

-- Server-side pagination for aggregate tabs. The underlying aggregation stays on PostgreSQL;
-- React receives only the selected page.
CREATE OR REPLACE FUNCTION public.get_sales_report_dimension(p_filters jsonb DEFAULT '{}'::jsonb,p_dimension text DEFAULT 'products',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH payload AS (SELECT public.get_sales_report_breakdowns(p_filters) data), dimension_dataset AS (
    SELECT value row FROM payload,jsonb_array_elements(CASE WHEN p_dimension IN ('products','customers','cashiers') THEN data->p_dimension ELSE '[]'::jsonb END)
  ), page_rows AS (
    SELECT row FROM dimension_dataset ORDER BY coalesce((row->>'net_revenue')::numeric,(row->>'net_sales')::numeric,0) DESC,coalesce(row->>'product_name',row->>'customer_name',row->>'cashier_name')
    LIMIT least(greatest(p_page_size,1),10000) OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),10000)
  ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(row) FROM page_rows),'[]'::jsonb),'total',(SELECT count(*) FROM dimension_dataset));
$$;

CREATE OR REPLACE FUNCTION public.validate_sales_report_cardinality(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH i AS (SELECT * FROM public.sales_report_invoice_rows(p_filters)),
       si AS (SELECT * FROM public.sales_report_item_rows(p_filters)),
       p AS (SELECT DISTINCT sale_id FROM si),
       payments AS (SELECT sp.id FROM public.sale_payments sp JOIN p ON p.sale_id=sp.sale_id),
       returns AS (
         SELECT sri.id FROM public.sales_return_items sri JOIN public.sales_returns sr ON sr.id=sri.return_id JOIN p ON p.sale_id=sr.sale_id
         UNION ALL
         SELECT ri.id FROM public.return_items ri JOIN public.returns r ON r.id=ri.return_id JOIN p ON p.sale_id=r.sale_id
         WHERE NOT EXISTS(SELECT 1 FROM public.sales_returns sr WHERE sr.id=r.id)
       )
  SELECT jsonb_build_object(
    'invoices',jsonb_build_object('rows',(SELECT count(*) FROM i),'unique_ids',(SELECT count(DISTINCT id) FROM i),'duplicate_ids',coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM i GROUP BY id HAVING count(*)>1) d),'[]'::jsonb)),
    'items',jsonb_build_object('rows',(SELECT count(*) FROM si),'unique_ids',(SELECT count(DISTINCT id) FROM si),'duplicate_ids',coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM si GROUP BY id HAVING count(*)>1) d),'[]'::jsonb)),
    'payments',jsonb_build_object('rows',(SELECT count(*) FROM payments),'unique_ids',(SELECT count(DISTINCT id) FROM payments),'duplicate_ids',coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM payments GROUP BY id HAVING count(*)>1) d),'[]'::jsonb)),
    'returns',jsonb_build_object('rows',(SELECT count(*) FROM returns),'unique_ids',(SELECT count(DISTINCT id) FROM returns),'duplicate_ids',coalesce((SELECT jsonb_agg(id) FROM (SELECT id FROM returns GROUP BY id HAVING count(*)>1) d),'[]'::jsonb))
  );
$$;

REVOKE ALL ON FUNCTION public.has_sales_report_permission(text) FROM public;
REVOKE ALL ON FUNCTION public.sales_report_item_rows(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.sales_report_invoice_rows(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_invoices(jsonb,integer,integer,text) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_items(jsonb,integer,integer,text,uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_payments(jsonb,integer,integer,text) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_returns(jsonb,integer,integer,text) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_summary(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_breakdowns(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_charts(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.get_sales_report_dimension(jsonb,text,integer,integer) FROM public;
REVOKE ALL ON FUNCTION public.validate_sales_report_cardinality(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.has_sales_report_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_report_item_rows(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_report_invoice_rows(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_invoices(jsonb,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_items(jsonb,integer,integer,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_payments(jsonb,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_returns(jsonb,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_summary(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_breakdowns(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_charts(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report_dimension(jsonb,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_sales_report_cardinality(jsonb) TO authenticated;
