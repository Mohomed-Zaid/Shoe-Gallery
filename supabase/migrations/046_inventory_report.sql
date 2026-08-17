-- Current-state Inventory Report: one aggregated row per main product.
CREATE OR REPLACE FUNCTION public.get_inventory_report(
  p_search TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_brand_id UUID DEFAULT NULL,
  p_stock_status TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25,
  p_sort TEXT DEFAULT 'product_asc'
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH settings AS (
    SELECT coalesce((SELECT default_low_stock_limit FROM public.store_settings LIMIT 1), 10)::integer AS low_stock_threshold
  ),
  variant_summary AS (
    SELECT
      v.product_id,
      count(v.id)::integer AS variant_count,
      coalesce(sum(v.stock_quantity), 0)::integer AS total_stock,
      min(v.cost_price) FILTER (WHERE v.cost_price IS NOT NULL) AS min_cost,
      max(v.cost_price) FILTER (WHERE v.cost_price IS NOT NULL) AS max_cost,
      min(v.selling_price) FILTER (WHERE v.selling_price IS NOT NULL) AS min_selling,
      max(v.selling_price) FILTER (WHERE v.selling_price IS NOT NULL) AS max_selling,
      coalesce(sum(v.stock_quantity * v.cost_price) FILTER (WHERE v.cost_price IS NOT NULL), 0) AS cost_value,
      coalesce(sum(v.stock_quantity * v.selling_price) FILTER (WHERE v.selling_price IS NOT NULL), 0) AS selling_value,
      count(*) FILTER (WHERE v.stock_quantity > 0 AND v.stock_quantity < settings.low_stock_threshold)::integer AS low_stock_count,
      count(*) FILTER (WHERE v.stock_quantity = 0)::integer AS out_of_stock_count,
      count(*) FILTER (WHERE v.stock_quantity < 0)::integer AS negative_stock_count,
      count(*) FILTER (WHERE v.cost_price IS NULL)::integer AS missing_cost_count,
      count(*) FILTER (WHERE v.selling_price IS NULL)::integer AS missing_selling_count,
      count(*) FILTER (WHERE nullif(btrim(v.barcode_number), '') IS NULL)::integer AS missing_barcode_count
    FROM public.product_variants v
    CROSS JOIN settings
    WHERE coalesce(v.is_active, true)
    GROUP BY v.product_id
  ),
  product_rows AS (
    SELECT
      p.id AS product_id,
      p.code AS product_code,
      p.name AS product_name,
      p.item_article,
      p.category_id,
      coalesce(c.name, 'Uncategorized') AS category_name,
      p.brand_id,
      coalesce(b.name, 'Unbranded') AS brand_name,
      p.description,
      coalesce(v.variant_count, 0) AS variant_count,
      coalesce(v.total_stock, 0) AS total_stock,
      v.min_cost, v.max_cost, v.min_selling, v.max_selling,
      coalesce(v.cost_value, 0) AS cost_value,
      coalesce(v.selling_value, 0) AS selling_value,
      coalesce(v.selling_value, 0) - coalesce(v.cost_value, 0) AS potential_profit,
      coalesce(v.low_stock_count, 0) AS low_stock_count,
      coalesce(v.out_of_stock_count, 0) AS out_of_stock_count,
      coalesce(v.negative_stock_count, 0) AS negative_stock_count,
      coalesce(v.missing_cost_count, 0) AS missing_cost_count,
      coalesce(v.missing_selling_count, 0) AS missing_selling_count,
      coalesce(v.missing_barcode_count, 0) AS missing_barcode_count,
      CASE
        WHEN coalesce(v.negative_stock_count, 0) > 0 THEN 'negative_stock'
        WHEN coalesce(v.total_stock, 0) = 0 THEN 'out_of_stock'
        WHEN coalesce(v.low_stock_count, 0) > 0 THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN variant_summary v ON v.product_id = p.id
    WHERE (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
      AND (nullif(btrim(p_search), '') IS NULL OR
        p.name ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(p.code, '') ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(p.item_article, '') ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(c.name, '') ILIKE '%' || btrim(p_search) || '%' OR
        coalesce(b.name, '') ILIKE '%' || btrim(p_search) || '%' OR EXISTS (
          SELECT 1 FROM public.product_variants sv
          WHERE sv.product_id = p.id AND coalesce(sv.is_active, true)
            AND coalesce(sv.barcode_number, '') ILIKE '%' || btrim(p_search) || '%'
        ))
  ),
  filtered AS (
    SELECT * FROM product_rows
    WHERE p_stock_status IS NULL OR stock_status = p_stock_status
  ),
  totals AS (
    SELECT
      count(*)::integer AS total_products,
      coalesce(sum(variant_count), 0)::integer AS total_variants,
      coalesce(sum(total_stock), 0)::integer AS total_stock,
      coalesce(sum(cost_value), 0) AS cost_value,
      coalesce(sum(selling_value), 0) AS selling_value,
      coalesce(sum(potential_profit), 0) AS potential_profit,
      coalesce(sum(low_stock_count), 0)::integer AS low_stock_variants,
      coalesce(sum(out_of_stock_count), 0)::integer AS out_of_stock_variants,
      coalesce(sum(missing_cost_count), 0)::integer AS missing_cost,
      coalesce(sum(missing_selling_count), 0)::integer AS missing_selling,
      coalesce(sum(missing_barcode_count), 0)::integer AS missing_barcode,
      coalesce(sum(negative_stock_count), 0)::integer AS negative_stock,
      (SELECT low_stock_threshold FROM settings) AS low_stock_threshold
    FROM filtered
  ),
  paged AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'product_asc' OR p_sort IS NULL THEN product_name END ASC,
      CASE WHEN p_sort = 'product_desc' THEN product_name END DESC,
      CASE WHEN p_sort = 'stock_desc' THEN total_stock END DESC,
      CASE WHEN p_sort = 'stock_asc' THEN total_stock END ASC,
      CASE WHEN p_sort = 'cost_value_desc' THEN cost_value END DESC,
      CASE WHEN p_sort = 'cost_value_asc' THEN cost_value END ASC,
      CASE WHEN p_sort = 'selling_value_desc' THEN selling_value END DESC,
      CASE WHEN p_sort = 'selling_value_asc' THEN selling_value END ASC,
      CASE WHEN p_sort = 'status_asc' THEN stock_status END ASC,
      product_name ASC, product_id
    LIMIT least(greatest(p_page_size, 1), 100)
    OFFSET (greatest(p_page, 1) - 1) * least(greatest(p_page_size, 1), 100)
  )
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'summary', to_jsonb(totals)
  ) FROM totals;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_report(TEXT,UUID,UUID,TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_report(TEXT,UUID,UUID,TEXT,INTEGER,INTEGER,TEXT) TO authenticated;
