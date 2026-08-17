-- Purchase Report: purchase-level result with independently aggregated item data.
-- The final dataset contains exactly one row per purchases.id.
CREATE OR REPLACE FUNCTION public.get_purchase_report(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_payment_status TEXT DEFAULT NULL,
  p_purchase_status TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25,
  p_sort TEXT DEFAULT 'newest'
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH item_summary AS (
    SELECT
      pi.purchase_id,
      count(pi.id)::integer AS item_lines,
      coalesce(sum(pi.quantity), 0)::integer AS total_quantity
    FROM public.purchase_items pi
    GROUP BY pi.purchase_id
  ),
  filtered AS (
    SELECT
      p.id AS purchase_id,
      p.purchase_number,
      p.purchase_date,
      p.supplier_id,
      coalesce(s.name, 'Unknown Supplier') AS supplier_name,
      p.supplier_invoice_number,
      coalesce(i.item_lines, 0) AS item_lines,
      coalesce(i.total_quantity, 0) AS total_quantity,
      coalesce(p.subtotal, 0) AS subtotal,
      coalesce(p.discount_amount, 0) AS discount_amount,
      coalesce(p.additional_cost, 0) AS additional_cost,
      coalesce(p.total_amount, 0) AS total_amount,
      coalesce(p.paid_amount, 0) AS paid_amount,
      coalesce(p.balance_amount, greatest(p.total_amount - p.paid_amount, 0), 0) AS balance_amount,
      CASE
        WHEN coalesce(p.balance_amount, p.total_amount - p.paid_amount, 0) <= 0 AND p.total_amount > 0 THEN 'paid'
        WHEN coalesce(p.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS payment_status,
      p.status,
      p.payment_method,
      coalesce(p.created_by_email, 'Unknown') AS created_by,
      p.created_at
    FROM public.purchases p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    LEFT JOIN item_summary i ON i.purchase_id = p.id
    WHERE (p_start_date IS NULL OR p.purchase_date::date >= p_start_date)
      AND (p_end_date IS NULL OR p.purchase_date::date <= p_end_date)
      AND (p_supplier_id IS NULL OR p.supplier_id = p_supplier_id)
      AND (p_payment_status IS NULL OR p.payment_status = p_payment_status)
      AND (p_purchase_status IS NULL OR p.status = p_purchase_status)
      AND (p_payment_method IS NULL OR p.payment_method = p_payment_method OR EXISTS (
        SELECT 1 FROM public.supplier_payments sp
        WHERE sp.purchase_id = p.id AND sp.payment_method = p_payment_method
      ))
      AND (nullif(btrim(p_search), '') IS NULL OR
        p.purchase_number ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(p.supplier_invoice_number, '') ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(s.name, '') ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(s.phone, '') ILIKE '%' || btrim(p_search) || '%')
  ),
  totals AS (
    SELECT
      coalesce(sum(total_amount) FILTER (WHERE status = 'completed'), 0) AS total_purchase_value,
      count(*) FILTER (WHERE status = 'completed')::integer AS total_purchases,
      coalesce(sum(total_quantity) FILTER (WHERE status = 'completed'), 0)::integer AS total_quantity,
      coalesce(sum(paid_amount) FILTER (WHERE status = 'completed'), 0) AS total_paid,
      coalesce(sum(balance_amount) FILTER (WHERE status = 'completed'), 0) AS total_outstanding,
      coalesce(sum(discount_amount) FILTER (WHERE status = 'completed'), 0) AS total_discounts
    FROM filtered
  ),
  paged AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'oldest' THEN purchase_date END ASC,
      CASE WHEN p_sort = 'number_asc' THEN purchase_number END ASC,
      CASE WHEN p_sort = 'number_desc' THEN purchase_number END DESC,
      CASE WHEN p_sort = 'supplier_asc' THEN supplier_name END ASC,
      CASE WHEN p_sort = 'total_desc' THEN total_amount END DESC,
      CASE WHEN p_sort = 'total_asc' THEN total_amount END ASC,
      CASE WHEN p_sort = 'balance_desc' THEN balance_amount END DESC,
      CASE WHEN p_sort = 'balance_asc' THEN balance_amount END ASC,
      CASE WHEN p_sort = 'newest' OR p_sort IS NULL THEN purchase_date END DESC,
      created_at DESC, purchase_id
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'summary', to_jsonb(totals)
  ) FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_purchase_report(DATE,DATE,TEXT,UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_report(DATE,DATE,TEXT,UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT) TO authenticated;
