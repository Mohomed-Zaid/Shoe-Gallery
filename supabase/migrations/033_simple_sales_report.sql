-- Simple invoice-level Sales Report.
-- This migration removes only the previous reporting functions. It does not
-- modify sales, sale_items, sale_payments, returns, inventory, or other data.

DROP FUNCTION IF EXISTS public.validate_sales_report_cardinality(jsonb);
DROP FUNCTION IF EXISTS public.get_sales_report_dimension(jsonb, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_sales_report_charts(jsonb);
DROP FUNCTION IF EXISTS public.get_sales_report_breakdowns(jsonb);
DROP FUNCTION IF EXISTS public.get_sales_report_summary(jsonb);
DROP FUNCTION IF EXISTS public.get_sales_report_returns(jsonb, integer, integer, text);
DROP FUNCTION IF EXISTS public.get_sales_report_payments(jsonb, integer, integer, text);
DROP FUNCTION IF EXISTS public.get_sales_report_items(jsonb, integer, integer, text, uuid);
DROP FUNCTION IF EXISTS public.get_sales_report_invoices(jsonb, integer, integer, text);
DROP FUNCTION IF EXISTS public.sales_report_invoice_rows(jsonb);
DROP FUNCTION IF EXISTS public.sales_report_item_rows(jsonb);
DROP FUNCTION IF EXISTS public.get_sales_report(jsonb);
DROP FUNCTION IF EXISTS public.has_sales_report_permission(text);

CREATE INDEX IF NOT EXISTS idx_sales_report_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_report_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_report_customer_id ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_cashier_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_report_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_payments_sale_id ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_payments_method ON public.sale_payments(payment_method);

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
SET search_path = public
AS $$
  WITH date_bounds AS (
    SELECT
      p_start_date::timestamp AT TIME ZONE 'Asia/Colombo' AS starts_at,
      (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Colombo' AS ends_at
  ),
  item_totals AS (
    SELECT
      sale_item.sale_id,
      count(*)::integer AS item_count,
      coalesce(sum(sale_item.quantity), 0)::integer AS total_quantity
    FROM public.sale_items AS sale_item
    GROUP BY sale_item.sale_id
  ),
  payment_totals AS (
    SELECT
      payment.sale_id,
      count(*)::integer AS payment_count,
      count(DISTINCT payment.payment_method)::integer AS method_count,
      min(payment.payment_method) AS single_method,
      coalesce(sum(payment.amount), 0) AS total_paid
    FROM public.sale_payments AS payment
    GROUP BY payment.sale_id
  ),
  invoice_dataset AS (
    SELECT
      sale.id,
      coalesce(sale.invoice_number, sale.id::text) AS invoice_number,
      sale.created_at,
      sale.customer_id,
      coalesce(customer.name, 'Walk-in Customer') AS customer_name,
      sale.user_id AS cashier_id,
      coalesce(cashier.full_name, cashier.email, 'Unknown') AS cashier_name,
      coalesce(items.item_count, 0)::integer AS item_count,
      coalesce(items.total_quantity, 0)::integer AS total_quantity,
      coalesce(sale.subtotal, 0) AS subtotal,
      coalesce(sale.discount_amount, 0) AS discount,
      coalesce(sale.total_amount, 0) AS total,
      CASE
        WHEN coalesce(payments.payment_count, 0) > 0 THEN payments.total_paid
        ELSE coalesce(sale.paid_amount, 0)
      END AS amount_paid,
      greatest(
        coalesce(sale.total_amount, 0) -
        CASE
          WHEN coalesce(payments.payment_count, 0) > 0 THEN payments.total_paid
          ELSE coalesce(sale.paid_amount, 0)
        END,
        0
      ) AS balance,
      CASE
        WHEN coalesce(payments.method_count, 0) > 1 THEN 'split_payment'
        WHEN payments.method_count = 1 THEN payments.single_method
        ELSE sale.payment_method
      END AS payment_method,
      sale.status
    FROM public.sales AS sale
    CROSS JOIN date_bounds AS bounds
    LEFT JOIN item_totals AS items ON items.sale_id = sale.id
    LEFT JOIN payment_totals AS payments ON payments.sale_id = sale.id
    LEFT JOIN public.customers AS customer ON customer.id = sale.customer_id
    LEFT JOIN public.profiles AS cashier ON cashier.id = sale.user_id
    WHERE EXISTS (SELECT 1 FROM public.profiles AS caller WHERE caller.id = auth.uid())
      AND sale.status <> 'held'
      AND sale.created_at >= bounds.starts_at
      AND sale.created_at < bounds.ends_at
      AND (p_invoice_number IS NULL OR p_invoice_number = '' OR sale.invoice_number ILIKE '%' || p_invoice_number || '%')
      AND (p_customer_id IS NULL OR sale.customer_id = p_customer_id)
      AND (p_cashier_id IS NULL OR sale.user_id = p_cashier_id)
      AND (p_status IS NULL OR p_status = '' OR sale.status = p_status)
      AND (
        p_payment_method IS NULL
        OR p_payment_method = ''
        OR (p_payment_method = 'split_payment' AND coalesce(payments.method_count, 0) > 1)
        OR (
          p_payment_method <> 'split_payment'
          AND (
            EXISTS (
              SELECT 1
              FROM public.sale_payments AS filtered_payment
              WHERE filtered_payment.sale_id = sale.id
                AND filtered_payment.payment_method = p_payment_method
            )
            OR (
              coalesce(payments.payment_count, 0) = 0
              AND sale.payment_method = p_payment_method
            )
          )
        )
      )
  ),
  report_summary AS (
    SELECT
      coalesce(sum(CASE WHEN status <> 'cancelled' THEN total ELSE 0 END), 0) AS total_sales,
      count(*)::integer AS total_invoices,
      coalesce(sum(CASE WHEN status <> 'cancelled' THEN total_quantity ELSE 0 END), 0)::integer AS total_quantity,
      coalesce(sum(CASE WHEN status <> 'cancelled' THEN amount_paid ELSE 0 END), 0) AS total_received,
      coalesce(sum(CASE WHEN status <> 'cancelled' THEN balance ELSE 0 END), 0) AS total_outstanding,
      coalesce(sum(CASE WHEN status <> 'cancelled' THEN discount ELSE 0 END), 0) AS total_discounts
    FROM invoice_dataset
  ),
  page_rows AS (
    SELECT invoice.*
    FROM invoice_dataset AS invoice
    ORDER BY
      CASE WHEN p_sort = 'newest' THEN invoice.created_at END DESC,
      CASE WHEN p_sort = 'oldest' THEN invoice.created_at END ASC,
      CASE WHEN p_sort = 'invoice_asc' THEN invoice.invoice_number END ASC,
      CASE WHEN p_sort = 'invoice_desc' THEN invoice.invoice_number END DESC,
      CASE WHEN p_sort = 'total_asc' THEN invoice.total END ASC,
      CASE WHEN p_sort = 'total_desc' THEN invoice.total END DESC,
      CASE WHEN p_sort = 'customer_asc' THEN invoice.customer_name END ASC,
      invoice.created_at DESC,
      invoice.id DESC
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce(
      (SELECT jsonb_agg(to_jsonb(report_row)) FROM page_rows AS report_row),
      '[]'::jsonb
    ),
    'total', (SELECT count(*) FROM invoice_dataset),
    'summary', coalesce(
      (SELECT to_jsonb(summary_row) FROM report_summary AS summary_row),
      jsonb_build_object(
        'total_sales', 0,
        'total_invoices', 0,
        'total_quantity', 0,
        'total_received', 0,
        'total_outstanding', 0,
        'total_discounts', 0
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_simple_sales_report(
  date, date, text, uuid, uuid, text, text, integer, integer, text
) FROM public;

GRANT EXECUTE ON FUNCTION public.get_simple_sales_report(
  date, date, text, uuid, uuid, text, text, integer, integer, text
) TO authenticated;
