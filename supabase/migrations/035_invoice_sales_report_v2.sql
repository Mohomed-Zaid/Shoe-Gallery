-- Invoice-level Sales Report v2.
-- Each child table is aggregated to one row per sale before it is joined.
CREATE INDEX IF NOT EXISTS idx_sales_report_v2_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_report_v2_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_report_v2_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_v2_payments_sale_id ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_v2_returns_sale_id ON public.sales_returns(sale_id);

CREATE OR REPLACE FUNCTION public.get_invoice_sales_report_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_cashier_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_sort text DEFAULT 'date_desc'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH item_summary AS (
    SELECT
      sale_id,
      count(*)::integer AS item_lines,
      coalesce(sum(quantity), 0)::integer AS total_quantity
    FROM public.sale_items
    GROUP BY sale_id
  ),
  payment_summary AS (
    SELECT
      sale_id,
      coalesce(sum(amount), 0) AS total_paid,
      count(DISTINCT payment_method)::integer AS method_count,
      min(payment_method) AS single_method
    FROM public.sale_payments
    GROUP BY sale_id
  ),
  return_item_summary AS (
    SELECT
      return_id,
      coalesce(sum(quantity_returned), 0)::integer AS returned_quantity,
      coalesce(sum(return_total), 0) AS returned_amount
    FROM public.sales_return_items
    GROUP BY return_id
  ),
  return_summary AS (
    SELECT
      sales_return.sale_id,
      count(*) FILTER (WHERE sales_return.status = 'completed')::integer AS completed_returns,
      coalesce(sum(return_items.returned_quantity) FILTER (WHERE sales_return.status = 'completed'), 0)::integer AS returned_quantity,
      coalesce(sum(return_items.returned_amount) FILTER (WHERE sales_return.status = 'completed'), 0) AS returned_amount,
      max(sales_return.return_date) FILTER (WHERE sales_return.status = 'completed') AS last_return_at
    FROM public.sales_returns AS sales_return
    LEFT JOIN return_item_summary AS return_items ON return_items.return_id = sales_return.id
    GROUP BY sales_return.sale_id
  ),
  invoice_rows AS (
    SELECT
      sale.id AS sale_id,
      coalesce(sale.invoice_number, sale.id::text) AS invoice_number,
      sale.created_at,
      sale.customer_id,
      coalesce(customer.name, 'Walk-in Customer') AS customer_name,
      customer.phone AS customer_phone,
      sale.user_id AS cashier_id,
      coalesce(cashier.full_name, cashier.email, 'Unknown') AS cashier_name,
      coalesce(items.item_lines, 0)::integer AS item_lines,
      coalesce(items.total_quantity, 0)::integer AS total_quantity,
      coalesce(sale.subtotal, 0) AS subtotal,
      coalesce(sale.discount_amount, 0) AS discount,
      coalesce(sale.total_amount, 0) AS total,
      CASE
        WHEN payments.sale_id IS NOT NULL THEN payments.total_paid
        ELSE coalesce(sale.paid_amount, 0)
      END AS paid,
      greatest(
        coalesce(sale.total_amount, 0) -
        CASE WHEN payments.sale_id IS NOT NULL THEN payments.total_paid ELSE coalesce(sale.paid_amount, 0) END,
        0
      ) AS balance,
      CASE
        WHEN coalesce(payments.method_count, 0) > 1 THEN 'split'
        WHEN payments.method_count = 1 THEN payments.single_method
        ELSE sale.payment_method
      END AS payment_method,
      sale.status,
      coalesce(returns.completed_returns, 0)::integer AS completed_returns,
      coalesce(returns.returned_quantity, 0)::integer AS returned_quantity,
      coalesce(returns.returned_amount, 0) AS returned_amount,
      returns.last_return_at
    FROM public.sales AS sale
    LEFT JOIN item_summary AS items ON items.sale_id = sale.id
    LEFT JOIN payment_summary AS payments ON payments.sale_id = sale.id
    LEFT JOIN return_summary AS returns ON returns.sale_id = sale.id
    LEFT JOIN public.customers AS customer ON customer.id = sale.customer_id
    LEFT JOIN public.profiles AS cashier ON cashier.id = sale.user_id
    WHERE EXISTS (SELECT 1 FROM public.profiles AS caller WHERE caller.id = auth.uid())
      AND sale.status <> 'held'
      AND (p_start_date IS NULL OR sale.created_at >= p_start_date::timestamp AT TIME ZONE 'Asia/Colombo')
      AND (p_end_date IS NULL OR sale.created_at < (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo')
      AND (
        coalesce(trim(p_search), '') = ''
        OR sale.invoice_number ILIKE '%' || trim(p_search) || '%'
        OR customer.name ILIKE '%' || trim(p_search) || '%'
        OR customer.phone ILIKE '%' || trim(p_search) || '%'
      )
      AND (p_cashier_id IS NULL OR sale.user_id = p_cashier_id)
      AND (coalesce(p_status, '') = '' OR sale.status = p_status)
      AND (
        coalesce(p_payment_method, '') = ''
        OR (p_payment_method = 'split' AND coalesce(payments.method_count, 0) > 1)
        OR (
          p_payment_method <> 'split'
          AND CASE
            WHEN payments.method_count = 1 THEN payments.single_method = p_payment_method
            WHEN payments.sale_id IS NULL THEN sale.payment_method = p_payment_method
            ELSE false
          END
        )
      )
  ),
  report_summary AS (
    SELECT
      coalesce(sum(total) FILTER (WHERE status <> 'cancelled'), 0) AS total_sales,
      count(*)::integer AS total_invoices,
      coalesce(sum(total_quantity) FILTER (WHERE status <> 'cancelled'), 0)::integer AS items_sold,
      coalesce(sum(discount) FILTER (WHERE status <> 'cancelled'), 0) AS total_discounts,
      coalesce(sum(paid) FILTER (WHERE status <> 'cancelled'), 0) AS total_received,
      coalesce(sum(balance) FILTER (WHERE status <> 'cancelled'), 0) AS outstanding
    FROM invoice_rows
  ),
  page_rows AS (
    SELECT invoice.*
    FROM invoice_rows AS invoice
    ORDER BY
      CASE WHEN p_sort = 'date_asc' THEN invoice.created_at END ASC,
      CASE WHEN p_sort = 'date_desc' THEN invoice.created_at END DESC,
      CASE WHEN p_sort = 'invoice_asc' THEN invoice.invoice_number END ASC,
      CASE WHEN p_sort = 'invoice_desc' THEN invoice.invoice_number END DESC,
      CASE WHEN p_sort = 'customer_asc' THEN invoice.customer_name END ASC,
      CASE WHEN p_sort = 'customer_desc' THEN invoice.customer_name END DESC,
      CASE WHEN p_sort = 'total_asc' THEN invoice.total END ASC,
      CASE WHEN p_sort = 'total_desc' THEN invoice.total END DESC,
      CASE WHEN p_sort = 'balance_asc' THEN invoice.balance END ASC,
      CASE WHEN p_sort = 'balance_desc' THEN invoice.balance END DESC,
      invoice.created_at DESC,
      invoice.sale_id DESC
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(report_row)) FROM page_rows AS report_row), '[]'::jsonb),
    'count', (SELECT count(*) FROM invoice_rows),
    'summary', (SELECT to_jsonb(summary_row) FROM report_summary AS summary_row)
  );
$$;

REVOKE ALL ON FUNCTION public.get_invoice_sales_report_v2(
  date, date, text, uuid, text, text, integer, integer, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.get_invoice_sales_report_v2(
  date, date, text, uuid, text, text, integer, integer, text
) TO authenticated;
