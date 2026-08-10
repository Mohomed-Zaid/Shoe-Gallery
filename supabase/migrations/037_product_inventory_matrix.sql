-- Convert the Inventory detail view to a size x colour matrix whose stock source
-- of truth is product_variants.stock_quantity.

-- Cleanup for installations that briefly received the superseded sheet migration.
DROP FUNCTION IF EXISTS public.save_product_inventory_sheet(UUID, JSONB, JSONB, NUMERIC, NUMERIC);
DROP TABLE IF EXISTS public.inventory_sheets;

CREATE TABLE IF NOT EXISTS public.inventory_matrix_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL CHECK (dimension_type IN ('size', 'colour')),
  value TEXT NOT NULL CHECK (btrim(value) <> ''),
  normalized_value TEXT GENERATED ALWAYS AS (lower(btrim(value))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, dimension_type, normalized_value)
);

CREATE INDEX IF NOT EXISTS inventory_matrix_dimensions_product_idx
  ON public.inventory_matrix_dimensions(product_id, dimension_type, created_at);

ALTER TABLE public.inventory_matrix_dimensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view inventory matrix dimensions" ON public.inventory_matrix_dimensions;
CREATE POLICY "Authenticated users can view inventory matrix dimensions"
  ON public.inventory_matrix_dimensions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can manage inventory matrix dimensions" ON public.inventory_matrix_dimensions;
CREATE POLICY "Admin can manage inventory matrix dimensions"
  ON public.inventory_matrix_dimensions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Preserve every existing active variant as a visible matrix dimension.
INSERT INTO public.inventory_matrix_dimensions (product_id, dimension_type, value)
SELECT DISTINCT ON (product_id, lower(btrim(size))) product_id, 'size', btrim(size)
FROM public.product_variants
WHERE is_active IS DISTINCT FROM FALSE AND btrim(size) <> ''
ORDER BY product_id, lower(btrim(size)), created_at
ON CONFLICT (product_id, dimension_type, normalized_value) DO NOTHING;

INSERT INTO public.inventory_matrix_dimensions (product_id, dimension_type, value)
SELECT DISTINCT ON (product_id, lower(btrim(color))) product_id, 'colour', btrim(color)
FROM public.product_variants
WHERE is_active IS DISTINCT FROM FALSE AND btrim(color) <> ''
ORDER BY product_id, lower(btrim(color)), created_at
ON CONFLICT (product_id, dimension_type, normalized_value) DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_inventory_matrix_dimension(
  p_product_id UUID,
  p_dimension_type TEXT,
  p_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  opposite_dimension RECORD;
  requested_value TEXT := btrim(p_value);
  existing_variant_id UUID;
  base_cost NUMERIC;
  base_selling NUMERIC;
BEGIN
  IF p_dimension_type NOT IN ('size', 'colour') OR requested_value = '' THEN
    RAISE EXCEPTION 'A valid size or colour is required';
  END IF;

  SELECT
    COALESCE(p.base_cost_price, first_variant.cost_price, 0),
    COALESCE(p.base_selling_price, first_variant.selling_price, 0)
  INTO base_cost, base_selling
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT cost_price, selling_price
    FROM public.product_variants
    WHERE product_id = p.id
    ORDER BY created_at
    LIMIT 1
  ) first_variant ON TRUE
  WHERE p.id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  INSERT INTO public.inventory_matrix_dimensions (product_id, dimension_type, value)
  VALUES (p_product_id, p_dimension_type, requested_value)
  ON CONFLICT (product_id, dimension_type, normalized_value) DO NOTHING;

  FOR opposite_dimension IN
    SELECT value
    FROM public.inventory_matrix_dimensions
    WHERE product_id = p_product_id
      AND dimension_type = CASE WHEN p_dimension_type = 'size' THEN 'colour' ELSE 'size' END
    ORDER BY created_at
  LOOP
    SELECT id INTO existing_variant_id
    FROM public.product_variants
    WHERE product_id = p_product_id
      AND lower(btrim(size)) = lower(CASE WHEN p_dimension_type = 'size' THEN requested_value ELSE opposite_dimension.value END)
      AND lower(btrim(color)) = lower(CASE WHEN p_dimension_type = 'colour' THEN requested_value ELSE opposite_dimension.value END)
    ORDER BY is_active DESC, created_at
    LIMIT 1;

    IF existing_variant_id IS NULL THEN
      INSERT INTO public.product_variants (
        product_id, size, color, cost_price, selling_price, stock_quantity, barcode_number, is_active
      ) VALUES (
        p_product_id,
        CASE WHEN p_dimension_type = 'size' THEN requested_value ELSE opposite_dimension.value END,
        CASE WHEN p_dimension_type = 'colour' THEN requested_value ELSE opposite_dimension.value END,
        base_cost, base_selling, 0, NULL, TRUE
      );
    ELSE
      UPDATE public.product_variants SET is_active = TRUE WHERE id = existing_variant_id;
    END IF;

    existing_variant_id := NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_inventory_matrix_dimension(
  p_product_id UUID,
  p_dimension_type TEXT,
  p_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_dimension_type NOT IN ('size', 'colour') THEN
    RAISE EXCEPTION 'Invalid matrix dimension';
  END IF;

  DELETE FROM public.inventory_matrix_dimensions
  WHERE product_id = p_product_id
    AND dimension_type = p_dimension_type
    AND normalized_value = lower(btrim(p_value));

  UPDATE public.product_variants
  SET is_active = FALSE
  WHERE product_id = p_product_id
    AND is_active IS DISTINCT FROM FALSE
    AND CASE
      WHEN p_dimension_type = 'size' THEN lower(btrim(size)) = lower(btrim(p_value))
      ELSE lower(btrim(color)) = lower(btrim(p_value))
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inventory_matrix_stock(
  p_product_id UUID,
  p_size TEXT,
  p_colour TEXT,
  p_quantity INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  variant_row RECORD;
  primary_variant_id UUID;
  current_total INTEGER := 0;
  change_amount INTEGER;
  remaining_remove INTEGER;
  remove_amount INTEGER;
  base_cost NUMERIC;
  base_selling NUMERIC;
  previous_quantity INTEGER;
  new_quantity INTEGER;
BEGIN
  IF p_quantity < 0 THEN RAISE EXCEPTION 'Stock quantity cannot be negative'; END IF;

  FOR variant_row IN
    SELECT id, stock_quantity
    FROM public.product_variants
    WHERE product_id = p_product_id
      AND is_active IS DISTINCT FROM FALSE
      AND lower(btrim(size)) = lower(btrim(p_size))
      AND lower(btrim(color)) = lower(btrim(p_colour))
    ORDER BY created_at, id
  LOOP
    IF primary_variant_id IS NULL THEN primary_variant_id := variant_row.id; END IF;
    current_total := current_total + variant_row.stock_quantity;
  END LOOP;

  IF primary_variant_id IS NULL THEN
    SELECT
      COALESCE(p.base_cost_price, first_variant.cost_price, 0),
      COALESCE(p.base_selling_price, first_variant.selling_price, 0)
    INTO base_cost, base_selling
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT cost_price, selling_price
      FROM public.product_variants
      WHERE product_id = p.id
      ORDER BY created_at
      LIMIT 1
    ) first_variant ON TRUE
    WHERE p.id = p_product_id;

    INSERT INTO public.product_variants (
      product_id, size, color, cost_price, selling_price, stock_quantity, barcode_number, is_active
    ) VALUES (p_product_id, btrim(p_size), btrim(p_colour), base_cost, base_selling, 0, NULL, TRUE)
    RETURNING id INTO primary_variant_id;
  END IF;

  IF p_quantity > current_total THEN
    change_amount := p_quantity - current_total;
    UPDATE public.product_variants
    SET stock_quantity = stock_quantity + change_amount
    WHERE id = primary_variant_id
    RETURNING stock_quantity - change_amount, stock_quantity
    INTO previous_quantity, new_quantity;

    INSERT INTO public.inventory_history (
      variant_id, change_type, quantity_changed, previous_quantity, new_quantity, reason, user_id
    ) VALUES (
      primary_variant_id, 'add', change_amount,
      previous_quantity, new_quantity,
      'Inventory matrix adjustment', auth.uid()
    );
  ELSIF p_quantity < current_total THEN
    remaining_remove := current_total - p_quantity;
    FOR variant_row IN
      SELECT id, stock_quantity
      FROM public.product_variants
      WHERE product_id = p_product_id
        AND is_active IS DISTINCT FROM FALSE
        AND lower(btrim(size)) = lower(btrim(p_size))
        AND lower(btrim(color)) = lower(btrim(p_colour))
        AND stock_quantity > 0
      ORDER BY created_at DESC, id DESC
    LOOP
      EXIT WHEN remaining_remove <= 0;
      remove_amount := LEAST(variant_row.stock_quantity, remaining_remove);
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - remove_amount
      WHERE id = variant_row.id;

      INSERT INTO public.inventory_history (
        variant_id, change_type, quantity_changed, previous_quantity, new_quantity, reason, user_id
      ) VALUES (
        variant_row.id, 'remove', remove_amount, variant_row.stock_quantity,
        variant_row.stock_quantity - remove_amount, 'Inventory matrix adjustment', auth.uid()
      );
      remaining_remove := remaining_remove - remove_amount;
    END LOOP;
  END IF;

  RETURN p_quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.add_inventory_matrix_dimension(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_inventory_matrix_dimension(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_inventory_matrix_stock(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_inventory_matrix_dimension(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_inventory_matrix_dimension(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_matrix_stock(UUID, TEXT, TEXT, INTEGER) TO authenticated;
