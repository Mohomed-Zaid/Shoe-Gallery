-- Treat card processing as a business expense in reports, never as sales revenue.
-- Existing sales.card_payment_fee values are legacy POS surcharges, so report
-- card amounts first remove that surcharge from the recorded payment.
CREATE OR REPLACE FUNCTION public.calculate_card_fee(card_amount numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT round(greatest(coalesce(card_amount, 0), 0) * 0.0275, 2);
$$;

REVOKE ALL ON FUNCTION public.calculate_card_fee(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_card_fee(numeric) TO authenticated;

-- Sales Report: one row per invoice, with card accounting derived from the
-- actual card portion in sale_payments. Split invoices only charge the card part.
CREATE OR REPLACE FUNCTION public.get_simple_sales_report(
  p_start_date date,
  p_end_date date,
  p_invoice_number text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_cashier_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH date_bounds AS (
    SELECT
      p_start_date::timestamp AT TIME ZONE 'Asia/Colombo' AS starts_at,
      (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo' AS ends_at
  ),
  item_totals AS (
    SELECT sale_id, count(*)::integer AS item_count,
      coalesce(sum(quantity), 0)::integer AS total_quantity
    FROM public.sale_items
    GROUP BY sale_id
  ),
  payment_totals AS (
    SELECT sale_id, count(*)::integer AS payment_count,
      count(DISTINCT payment_method)::integer AS method_count,
      min(payment_method) AS single_method,
      coalesce(sum(amount), 0) AS total_paid,
      coalesce(sum(amount) FILTER (WHERE payment_method = 'card'), 0) AS raw_card_amount
    FROM public.sale_payments
    GROUP BY sale_id
  ),
  invoice_base AS (
    SELECT sale.id, coalesce(sale.invoice_number, sale.id::text) AS invoice_number,
      sale.created_at, sale.customer_id,
      coalesce(customer.name, 'Walk-in Customer') AS customer_name,
      sale.user_id AS cashier_id,
      coalesce(cashier.full_name, cashier.email, 'Unknown') AS cashier_name,
      coalesce(items.item_count, 0)::integer AS item_count,
      coalesce(items.total_quantity, 0)::integer AS total_quantity,
      coalesce(sale.subtotal, 0) AS subtotal,
      coalesce(sale.discount_amount, 0) AS discount,
      greatest(coalesce(sale.total_amount, 0) - coalesce(sale.card_payment_fee, 0), 0) AS sale_value,
      greatest(
        CASE WHEN coalesce(payments.payment_count, 0) > 0
          THEN payments.total_paid ELSE coalesce(sale.paid_amount, 0) END
        - coalesce(sale.card_payment_fee, 0), 0
      ) AS normalized_paid,
      greatest(
        CASE
          WHEN coalesce(payments.payment_count, 0) > 0 THEN payments.raw_card_amount
          WHEN sale.payment_method = 'card' THEN coalesce(sale.paid_amount, 0)
          ELSE 0
        END - coalesce(sale.card_payment_fee, 0), 0
      ) AS gross_card_amount,
      CASE
        WHEN coalesce(payments.method_count, 0) > 1 THEN 'split_payment'
        WHEN payments.method_count = 1 THEN payments.single_method
        ELSE sale.payment_method
      END AS payment_method,
      sale.status,
      coalesce(payments.payment_count, 0) AS payment_count,
      coalesce(payments.method_count, 0) AS method_count
    FROM public.sales AS sale
    CROSS JOIN date_bounds AS bounds
    LEFT JOIN item_totals AS items ON items.sale_id = sale.id
    LEFT JOIN payment_totals AS payments ON payments.sale_id = sale.id
    LEFT JOIN public.customers AS customer ON customer.id = sale.customer_id
    LEFT JOIN public.profiles AS cashier ON cashier.id = sale.user_id
    WHERE EXISTS (SELECT 1 FROM public.profiles AS caller WHERE caller.id = auth.uid())
      AND sale.status <> 'held'
      AND sale.created_at >= bounds.starts_at AND sale.created_at < bounds.ends_at
      AND (p_invoice_number IS NULL OR p_invoice_number = '' OR sale.invoice_number ILIKE '%' || p_invoice_number || '%')
      AND (p_customer_id IS NULL OR sale.customer_id = p_customer_id)
      AND (p_cashier_id IS NULL OR sale.user_id = p_cashier_id)
      AND (p_status IS NULL OR p_status = '' OR sale.status = p_status)
      AND (
        p_payment_method IS NULL OR p_payment_method = ''
        OR (p_payment_method = 'split_payment' AND coalesce(payments.method_count, 0) > 1)
        OR (p_payment_method <> 'split_payment' AND (
          EXISTS (SELECT 1 FROM public.sale_payments AS fp
            WHERE fp.sale_id = sale.id AND fp.payment_method = p_payment_method)
          OR (coalesce(payments.payment_count, 0) = 0 AND sale.payment_method = p_payment_method)
        ))
      )
  ),
  invoice_dataset AS (
    SELECT id, invoice_number, created_at, customer_id, customer_name, cashier_id,
      cashier_name, item_count, total_quantity, subtotal, discount,
      sale_value AS selling_price, sale_value AS total,
      normalized_paid AS amount_paid,
      greatest(sale_value - normalized_paid, 0) AS balance,
      gross_card_amount,
      public.calculate_card_fee(gross_card_amount) AS card_processing_fee,
      gross_card_amount - public.calculate_card_fee(gross_card_amount) AS net_card_amount,
      payment_method, status
    FROM invoice_base
  ),
  report_summary AS (
    SELECT
      coalesce(sum(total) FILTER (WHERE status <> 'cancelled'), 0) AS total_sales,
      count(*)::integer AS total_invoices,
      coalesce(sum(total_quantity) FILTER (WHERE status <> 'cancelled'), 0)::integer AS total_quantity,
      coalesce(sum(amount_paid) FILTER (WHERE status <> 'cancelled'), 0) AS total_received,
      coalesce(sum(balance) FILTER (WHERE status <> 'cancelled'), 0) AS total_outstanding,
      coalesce(sum(discount) FILTER (WHERE status <> 'cancelled'), 0) AS total_discounts,
      coalesce(sum(gross_card_amount) FILTER (WHERE status <> 'cancelled'), 0) AS total_gross_card_amount,
      coalesce(sum(card_processing_fee) FILTER (WHERE status <> 'cancelled'), 0) AS total_card_processing_fees,
      coalesce(sum(net_card_amount) FILTER (WHERE status <> 'cancelled'), 0) AS total_net_card_amount
    FROM invoice_dataset
  ),
  page_rows AS (
    SELECT invoice.* FROM invoice_dataset AS invoice
    ORDER BY
      CASE WHEN p_sort = 'newest' THEN invoice.created_at END DESC,
      CASE WHEN p_sort = 'oldest' THEN invoice.created_at END ASC,
      CASE WHEN p_sort = 'invoice_asc' THEN invoice.invoice_number END ASC,
      CASE WHEN p_sort = 'invoice_desc' THEN invoice.invoice_number END DESC,
      CASE WHEN p_sort = 'total_asc' THEN invoice.total END ASC,
      CASE WHEN p_sort = 'total_desc' THEN invoice.total END DESC,
      CASE WHEN p_sort = 'customer_asc' THEN invoice.customer_name END ASC,
      invoice.created_at DESC, invoice.id DESC
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM page_rows r), '[]'::jsonb),
    'total', (SELECT count(*) FROM invoice_dataset),
    'summary', (SELECT to_jsonb(s) FROM report_summary s)
  );
$$;

-- Cashup Report: card settlement fields are non-cash accounting fields and do
-- not participate in expected drawer cash.
CREATE OR REPLACE FUNCTION public.get_cashup_report(
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL,
  p_search text DEFAULT NULL, p_cashier_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL, p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25, p_sort text DEFAULT 'newest'
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH sessions AS (
  SELECT s.*, coalesce(pr.full_name, pr.email, 'Cashier') cashier_name,
    'CS-' || upper(substr(replace(s.id::text, '-', ''), 1, 8)) cashup_number,
    coalesce(s.closing_time, now() + interval '1 second') session_end
  FROM public.cash_register_sessions s
  LEFT JOIN public.profiles pr ON pr.id = s.user_id
  WHERE (p_start_date IS NULL OR s.opening_time::date >= p_start_date)
    AND (p_end_date IS NULL OR s.opening_time::date <= p_end_date)
    AND (p_cashier_id IS NULL OR s.user_id = p_cashier_id)
),
sale_items AS (
  SELECT si.sale_id, count(si.id)::int items, sum(si.quantity)::int quantity,
    sum(coalesce(si.line_subtotal, si.selling_price * si.quantity)) gross,
    sum(coalesce(si.discount_amount, 0)) item_discount
  FROM public.sale_items si GROUP BY si.sale_id
),
session_sales AS (
  SELECT ss.id session_id, count(sa.id)::int total_invoices,
    coalesce(sum(si.quantity), 0)::int items_sold,
    coalesce(sum(si.quantity), 0)::int quantity_sold,
    coalesce(sum(si.gross), 0) gross_sales,
    coalesce(sum(coalesce(sa.discount_amount, 0)), 0) discounts,
    coalesce(sum(greatest(coalesce(sa.total_amount, 0) - coalesce(sa.card_payment_fee, 0), 0)), 0) total_sales
  FROM sessions ss
  LEFT JOIN public.sales sa ON sa.user_id = ss.user_id
    AND sa.created_at >= ss.opening_time AND sa.created_at < ss.session_end
    AND sa.status IN ('completed', 'partially_returned', 'fully_returned')
  LEFT JOIN sale_items si ON si.sale_id = sa.id GROUP BY ss.id
),
payment_sales AS (
  SELECT ss.id session_id, p.sale_id,
    coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'cash'), 0) cash_amount,
    greatest(coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'card'), 0)
      - coalesce(max(CASE WHEN sa.created_at >= ss.opening_time AND sa.created_at < ss.session_end
        THEN sa.card_payment_fee ELSE 0 END), 0), 0) card_amount,
    coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'bank_transfer'), 0) bank_amount,
    coalesce(sum(p.amount) FILTER (WHERE p.payment_method NOT IN ('cash', 'card', 'bank_transfer', 'credit')), 0) other_amount
  FROM sessions ss
  LEFT JOIN public.sale_payments p ON p.received_by = ss.user_id
    AND p.payment_date >= ss.opening_time AND p.payment_date < ss.session_end
  LEFT JOIN public.sales sa ON sa.id = p.sale_id
  GROUP BY ss.id, p.sale_id
),
payments AS (
  SELECT session_id, coalesce(sum(cash_amount), 0) cash_sales,
    coalesce(sum(card_amount), 0) card_sales,
    coalesce(sum(public.calculate_card_fee(card_amount)), 0) card_processing_fees,
    coalesce(sum(card_amount - public.calculate_card_fee(card_amount)), 0) net_card_amount,
    coalesce(sum(bank_amount), 0) bank_sales, coalesce(sum(other_amount), 0) other_sales
  FROM payment_sales GROUP BY session_id
),
sale_paid AS (
  SELECT ss.id session_id, sa.id sale_id,
    greatest(coalesce(sa.total_amount, 0) - coalesce(sa.card_payment_fee, 0), 0) total_amount,
    greatest(coalesce(sum(p.amount), 0) - coalesce(sa.card_payment_fee, 0), 0) paid
  FROM sessions ss JOIN public.sales sa ON sa.user_id = ss.user_id
    AND sa.created_at >= ss.opening_time AND sa.created_at < ss.session_end
    AND sa.status IN ('completed', 'partially_returned', 'fully_returned')
  LEFT JOIN public.sale_payments p ON p.sale_id = sa.id
  GROUP BY ss.id, sa.id, sa.total_amount, sa.card_payment_fee
),
credits AS (SELECT session_id, coalesce(sum(greatest(total_amount - paid, 0)), 0) credit_sales FROM sale_paid GROUP BY session_id),
refunds AS (
  SELECT ss.id session_id, coalesce(sum(r.amount) FILTER (WHERE r.refund_method = 'cash'), 0) cash_refunds
  FROM sessions ss LEFT JOIN public.sale_refunds r ON r.refunded_by = ss.user_id
    AND r.refund_date >= ss.opening_time AND r.refund_date < ss.session_end GROUP BY ss.id
),
expenses AS (
  SELECT ss.id session_id, coalesce(sum(e.amount), 0) cash_expenses
  FROM sessions ss LEFT JOIN public.cash_register_expenses e ON e.session_id = ss.id GROUP BY ss.id
),
deposits AS (
  SELECT ss.id session_id, coalesce(sum(m.amount), 0) bank_deposits
  FROM sessions ss LEFT JOIN public.cash_register_movements m ON m.cash_register_id = ss.id
    AND m.movement_type = 'bank_deposit' GROUP BY ss.id
),
rows0 AS (
  SELECT s.id session_id, s.cashup_number, s.user_id, s.cashier_name,
    s.opening_time, s.closing_time, s.opening_balance opening_cash,
    coalesce(v.total_invoices, 0) total_invoices, coalesce(v.items_sold, 0) items_sold,
    coalesce(v.gross_sales, 0) gross_sales, coalesce(v.discounts, 0) discounts,
    coalesce(v.total_sales, 0) total_sales, p.cash_sales, p.card_sales,
    p.card_processing_fees, p.net_card_amount, p.bank_sales,
    coalesce(c.credit_sales, 0) credit_sales, p.other_sales,
    r.cash_refunds, e.cash_expenses, d.bank_deposits,
    s.opening_balance + p.cash_sales - r.cash_refunds - e.cash_expenses - d.bank_deposits expected_cash,
    s.actual_cash counted_cash,
    CASE WHEN s.actual_cash IS NULL THEN NULL ELSE s.actual_cash -
      (s.opening_balance + p.cash_sales - r.cash_refunds - e.cash_expenses - d.bank_deposits) END difference,
    s.status,
    CASE WHEN s.status = 'open' THEN 'open'
      WHEN abs(s.actual_cash - (s.opening_balance + p.cash_sales - r.cash_refunds - e.cash_expenses - d.bank_deposits)) <= .01 THEN 'balanced'
      WHEN s.actual_cash - (s.opening_balance + p.cash_sales - r.cash_refunds - e.cash_expenses - d.bank_deposits) < 0 THEN 'short'
      ELSE 'over' END difference_status, s.notes
  FROM sessions s JOIN session_sales v ON v.session_id = s.id
  JOIN payments p ON p.session_id = s.id LEFT JOIN credits c ON c.session_id = s.id
  JOIN refunds r ON r.session_id = s.id JOIN expenses e ON e.session_id = s.id
  JOIN deposits d ON d.session_id = s.id
),
filtered AS (
  SELECT * FROM rows0 r WHERE
    (p_status IS NULL OR r.status = p_status OR r.difference_status = p_status)
    AND (nullif(btrim(p_search), '') IS NULL OR r.cashup_number ILIKE '%' || btrim(p_search) || '%'
      OR r.cashier_name ILIKE '%' || btrim(p_search) || '%'
      OR EXISTS (SELECT 1 FROM public.sales sa WHERE sa.user_id = r.user_id
        AND sa.created_at >= r.opening_time
        AND sa.created_at < coalesce(r.closing_time, now() + interval '1 second')
        AND sa.invoice_number ILIKE '%' || btrim(p_search) || '%'))
),
summary AS (
  SELECT count(*)::int sessions, coalesce(sum(total_sales), 0) total_sales,
    coalesce(sum(cash_sales), 0) cash_sales, coalesce(sum(card_sales), 0) card_sales,
    coalesce(sum(card_processing_fees), 0) card_processing_fees,
    coalesce(sum(net_card_amount), 0) net_card_amount,
    coalesce(sum(bank_sales), 0) bank_sales, coalesce(sum(credit_sales), 0) credit_sales,
    coalesce(sum(cash_expenses), 0) cash_expenses, coalesce(sum(bank_deposits), 0) bank_deposits,
    coalesce(sum(expected_cash), 0) expected_cash, coalesce(sum(counted_cash), 0) counted_cash,
    coalesce(sum(difference) FILTER (WHERE status = 'closed'), 0) cash_difference FROM filtered
),
daily AS (
  SELECT opening_time::date date, count(*)::int sessions, sum(total_sales) sales,
    sum(cash_sales) cash, sum(card_sales) card, sum(card_processing_fees) card_processing_fees,
    sum(net_card_amount) net_card_amount, sum(bank_sales) transfer, sum(credit_sales) credit,
    sum(expected_cash) expected_cash, coalesce(sum(counted_cash), 0) counted_cash,
    coalesce(sum(difference), 0) difference FROM filtered GROUP BY opening_time::date
),
cashiers AS (
  SELECT user_id::text key, cashier_name name, count(*)::int sessions,
    sum(total_invoices)::int invoices, sum(total_sales) sales, sum(cash_sales) cash_collected,
    coalesce(sum(difference), 0) difference FROM filtered GROUP BY user_id, cashier_name
),
paged AS (
  SELECT * FROM filtered ORDER BY
    CASE WHEN p_sort = 'oldest' THEN opening_time END ASC,
    CASE WHEN p_sort = 'sales_desc' THEN total_sales END DESC,
    CASE WHEN p_sort = 'difference_asc' THEN difference END ASC,
    CASE WHEN p_sort = 'cashier_asc' THEN cashier_name END ASC,
    CASE WHEN p_sort = 'newest' OR p_sort IS NULL THEN opening_time END DESC, session_id
  LIMIT least(greatest(p_page_size, 1), 100)
  OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
)
SELECT jsonb_build_object(
  'rows', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM paged p), '[]'::jsonb),
  'total', (SELECT count(*) FROM filtered), 'summary', to_jsonb(summary),
  'daily', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY date) FROM daily d), '[]'::jsonb),
  'cashiers', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY sales DESC) FROM cashiers c), '[]'::jsonb)
) FROM summary;
$$;

-- Profit facts with card fees allocated across the original invoice items by
-- their pre-return net revenue. Returns do not generate a second fee.
CREATE OR REPLACE FUNCTION public.profit_report_item_rows_after_card_fees(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  sale_item_id uuid, sale_id uuid, invoice_number text, sale_date timestamptz,
  customer_name text, cashier_id uuid, cashier_name text, payment_method text,
  status text, product_id uuid, product_name text, article text, category_id uuid,
  category_name text, brand_id uuid, brand_name text, variant_id uuid, size text,
  colour text, barcode text, quantity integer, returned_quantity integer,
  net_quantity integer, selling_price numeric, gross_sales numeric,
  item_discount numeric, invoice_discount numeric, discount numeric,
  returned_value numeric, net_revenue numeric, unit_cost numeric, sold_cogs numeric,
  reversed_cogs numeric, cogs numeric, gross_product_profit numeric,
  card_processing_fee numeric, profit numeric, margin numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
WITH payment_fees AS (
  SELECT p.sale_id,
    public.calculate_card_fee(greatest(
      coalesce(sum(p.amount) FILTER (WHERE p.payment_method = 'card'), 0)
      - coalesce(max(s.card_payment_fee), 0), 0
    )) card_processing_fee
  FROM public.sale_payments p JOIN public.sales s ON s.id = p.sale_id
  GROUP BY p.sale_id
),
filtered_items AS (
  SELECT sale_item_id, sale_id
  FROM public.profit_report_item_rows(p_filters)
),
base AS (
  SELECT i.*, greatest(i.net_revenue + i.returned_value, 0) fee_basis,
    sum(greatest(i.net_revenue + i.returned_value, 0)) OVER (PARTITION BY i.sale_id) invoice_fee_basis,
    coalesce(f.card_processing_fee, 0) invoice_card_fee
  FROM public.profit_report_item_rows(
    p_filters - 'categoryId' - 'brandId' - 'productId' - 'search'
  ) i
  LEFT JOIN payment_fees f ON f.sale_id = i.sale_id
),
allocated AS (
  SELECT b.*, CASE WHEN b.invoice_fee_basis > 0
    THEN b.invoice_card_fee * b.fee_basis / b.invoice_fee_basis ELSE 0 END allocated_card_fee
  FROM base b
)
SELECT sale_item_id, sale_id, invoice_number, sale_date, customer_name, cashier_id,
  cashier_name, payment_method, status, product_id, product_name, article,
  category_id, category_name, brand_id, brand_name, variant_id, size, colour,
  barcode, quantity, returned_quantity, net_quantity, selling_price, gross_sales,
  item_discount, invoice_discount, discount, returned_value, net_revenue,
  unit_cost, sold_cogs, reversed_cogs, cogs, profit AS gross_product_profit,
  allocated_card_fee AS card_processing_fee,
  CASE WHEN profit IS NULL THEN NULL ELSE profit - allocated_card_fee END AS profit,
  CASE WHEN net_revenue = 0 OR profit IS NULL THEN 0
    ELSE (profit - allocated_card_fee) / net_revenue * 100 END AS margin
FROM allocated
WHERE EXISTS (
  SELECT 1 FROM filtered_items f
  WHERE f.sale_item_id = allocated.sale_item_id AND f.sale_id = allocated.sale_id
);
$$;

CREATE OR REPLACE FUNCTION public.get_profit_report(
  p_filters jsonb DEFAULT '{}'::jsonb, p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25, p_sort text DEFAULT 'newest'
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
WITH items AS (SELECT * FROM public.profit_report_item_rows_after_card_fees(p_filters)),
invoices0 AS (
  SELECT sale_id, max(invoice_number) invoice_number, max(sale_date) sale_date,
    max(customer_name) customer_name, max(cashier_name) cashier_name,
    count(*)::int item_count, sum(net_quantity)::int quantity, sum(gross_sales) gross_sales,
    sum(discount) discount, sum(net_revenue) net_sales,
    CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE sum(cogs) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE sum(gross_product_profit) END gross_product_profit,
    sum(card_processing_fee) card_processing_fee,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE sum(profit) END profit,
    max(payment_method) payment_method, max(status) status
  FROM items GROUP BY sale_id
),
invoices AS (
  SELECT *, CASE WHEN net_sales = 0 OR profit IS NULL THEN 0 ELSE profit / net_sales * 100 END margin
  FROM invoices0 WHERE coalesce(p_filters->>'profitStatus', '') = ''
    OR (p_filters->>'profitStatus' = 'profit' AND profit >= 0)
    OR (p_filters->>'profitStatus' = 'loss' AND profit < 0)
),
summary AS (
  SELECT coalesce(sum(net_sales), 0) net_revenue,
    CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE coalesce(sum(cogs), 0) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE coalesce(sum(gross_product_profit), 0) END gross_profit,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE coalesce(sum(gross_product_profit), 0) END gross_product_profit,
    coalesce(sum(card_processing_fee), 0) card_processing_fees,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE coalesce(sum(profit), 0) END net_profit,
    CASE WHEN sum(net_sales) = 0 OR bool_or(profit IS NULL) THEN 0 ELSE sum(profit) / sum(net_sales) * 100 END profit_margin,
    coalesce(sum(discount), 0) discounts,
    (SELECT coalesce(sum(returned_value), 0) FROM items) return_value,
    coalesce(sum(quantity), 0)::int units_sold, count(*)::int completed_sales,
    (SELECT count(*) FROM items WHERE unit_cost IS NULL)::int missing_cost_items FROM invoices
),
products AS (
  SELECT coalesce(product_id::text, 'instant:' || product_name) key, product_name,
    max(article) article, sum(net_quantity)::int quantity, sum(net_revenue) revenue,
    CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE sum(cogs) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE sum(gross_product_profit) END gross_product_profit,
    sum(card_processing_fee) card_processing_fees,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE sum(profit) END profit
  FROM items GROUP BY product_id, product_name
),
variants AS (
  SELECT coalesce(variant_id::text, 'instant:' || product_name) key, product_name,
    max(article) article, size, colour, barcode, sum(net_quantity)::int quantity,
    sum(net_revenue) revenue, CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE sum(cogs) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE sum(gross_product_profit) END gross_product_profit,
    sum(card_processing_fee) card_processing_fees,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE sum(profit) END profit
  FROM items GROUP BY variant_id, product_name, size, colour, barcode
),
categories AS (
  SELECT coalesce(category_id::text, 'uncategorized') key, category_name name,
    sum(net_quantity)::int quantity, sum(net_revenue) revenue,
    CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE sum(cogs) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE sum(gross_product_profit) END gross_product_profit,
    sum(card_processing_fee) card_processing_fees,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE sum(profit) END profit
  FROM items GROUP BY category_id, category_name
),
brands AS (
  SELECT coalesce(brand_id::text, 'unbranded') key, brand_name name,
    sum(net_quantity)::int quantity, sum(net_revenue) revenue,
    CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE sum(cogs) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE sum(gross_product_profit) END gross_product_profit,
    sum(card_processing_fee) card_processing_fees,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE sum(profit) END profit
  FROM items GROUP BY brand_id, brand_name
),
daily AS (
  SELECT sale_date::date date, count(DISTINCT sale_id)::int invoices,
    sum(net_quantity)::int units, sum(net_revenue) revenue, sum(discount) discount,
    sum(returned_value) returns, CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE sum(cogs) END cogs,
    CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE sum(gross_product_profit) END gross_product_profit,
    sum(card_processing_fee) card_processing_fees,
    CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE sum(profit) END profit
  FROM items GROUP BY sale_date::date
),
paged AS (
  SELECT * FROM invoices ORDER BY
    CASE WHEN p_sort = 'oldest' THEN sale_date END ASC,
    CASE WHEN p_sort = 'revenue_desc' THEN net_sales END DESC,
    CASE WHEN p_sort = 'cogs_desc' THEN cogs END DESC,
    CASE WHEN p_sort = 'profit_desc' THEN profit END DESC,
    CASE WHEN p_sort = 'profit_asc' THEN profit END ASC,
    CASE WHEN p_sort = 'margin_desc' THEN margin END DESC,
    CASE WHEN p_sort = 'newest' OR p_sort IS NULL THEN sale_date END DESC, sale_id
  LIMIT least(greatest(p_page_size, 1), 100)
  OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
)
SELECT jsonb_build_object(
  'rows', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM paged p), '[]'::jsonb),
  'total', (SELECT count(*) FROM invoices), 'summary', to_jsonb(summary),
  'products', coalesce((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('margin', CASE WHEN revenue = 0 OR profit IS NULL THEN 0 ELSE profit / revenue * 100 END) ORDER BY profit DESC NULLS LAST) FROM products x), '[]'::jsonb),
  'variants', coalesce((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('margin', CASE WHEN revenue = 0 OR profit IS NULL THEN 0 ELSE profit / revenue * 100 END) ORDER BY profit DESC NULLS LAST) FROM variants x), '[]'::jsonb),
  'categories', coalesce((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('margin', CASE WHEN revenue = 0 OR profit IS NULL THEN 0 ELSE profit / revenue * 100 END) ORDER BY profit DESC NULLS LAST) FROM categories x), '[]'::jsonb),
  'brands', coalesce((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('margin', CASE WHEN revenue = 0 OR profit IS NULL THEN 0 ELSE profit / revenue * 100 END) ORDER BY profit DESC NULLS LAST) FROM brands x), '[]'::jsonb),
  'daily', coalesce((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('margin', CASE WHEN revenue = 0 OR profit IS NULL THEN 0 ELSE profit / revenue * 100 END) ORDER BY date) FROM daily x), '[]'::jsonb),
  'trend', coalesce((SELECT jsonb_agg(jsonb_build_object('date', date, 'revenue', revenue, 'cogs', coalesce(cogs, 0), 'profit', coalesce(profit, 0)) ORDER BY date) FROM daily), '[]'::jsonb)
)
FROM summary;
$$;

CREATE OR REPLACE FUNCTION public.get_profit_report_items(p_filters jsonb DEFAULT '{}'::jsonb, p_sale_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'sale_item_id', sale_item_id, 'sale_id', sale_id, 'invoice_number', invoice_number,
  'product_name', product_name, 'article', article, 'size', size, 'colour', colour,
  'barcode', barcode, 'quantity', quantity, 'selling_price', selling_price,
  'discount', discount, 'returned_value', returned_value, 'net_revenue', net_revenue,
  'unit_cost', unit_cost, 'total_cost', cogs, 'gross_product_profit', gross_product_profit,
  'card_processing_fee', card_processing_fee, 'profit', profit, 'margin', margin
) ORDER BY sale_date, invoice_number, product_name), '[]'::jsonb)
FROM public.profit_report_item_rows_after_card_fees(p_filters)
WHERE p_sale_id IS NULL OR sale_id = p_sale_id;
$$;

CREATE OR REPLACE FUNCTION public.get_profit_dashboard_summary(p_start_date date, p_end_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
WITH i AS (SELECT * FROM public.profit_report_item_rows_after_card_fees(
  jsonb_build_object('startDate', p_start_date, 'endDate', p_end_date)))
SELECT jsonb_build_object(
  'revenue', coalesce(sum(net_revenue), 0),
  'cogs', CASE WHEN bool_or(cogs IS NULL) THEN NULL ELSE coalesce(sum(cogs), 0) END,
  'gross_product_profit', CASE WHEN bool_or(gross_product_profit IS NULL) THEN NULL ELSE coalesce(sum(gross_product_profit), 0) END,
  'card_processing_fees', coalesce(sum(card_processing_fee), 0),
  'profit', CASE WHEN bool_or(profit IS NULL) THEN NULL ELSE coalesce(sum(profit), 0) END,
  'sales', count(DISTINCT sale_id)
) FROM i;
$$;

REVOKE ALL ON FUNCTION public.profit_report_item_rows_after_card_fees(jsonb),
  public.get_profit_report(jsonb, integer, integer, text),
  public.get_profit_report_items(jsonb, uuid),
  public.get_profit_dashboard_summary(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profit_report_item_rows_after_card_fees(jsonb),
  public.get_profit_report(jsonb, integer, integer, text),
  public.get_profit_report_items(jsonb, uuid),
  public.get_profit_dashboard_summary(date, date) TO authenticated;
