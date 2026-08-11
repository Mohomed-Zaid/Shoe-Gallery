-- Product variant prices are the single source of truth for Inventory.
-- Remove the superseded product-level Inventory price fields and ensure matrix
-- operations only create/update product_variants records.

ALTER TABLE public.product_variants
  ALTER COLUMN cost_price DROP NOT NULL,
  ALTER COLUMN selling_price DROP NOT NULL;

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
  variant_cost NUMERIC;
  variant_selling NUMERIC;
BEGIN
  IF p_dimension_type NOT IN ('size', 'colour') OR requested_value = '' THEN
    RAISE EXCEPTION 'A valid size or colour is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  SELECT cost_price, selling_price INTO variant_cost, variant_selling
  FROM public.product_variants
  WHERE product_id = p_product_id AND is_active IS DISTINCT FROM FALSE
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.inventory_matrix_dimensions (product_id, dimension_type, value)
  VALUES (p_product_id, p_dimension_type, requested_value)
  ON CONFLICT (product_id, dimension_type, normalized_value) DO NOTHING;

  FOR opposite_dimension IN
    SELECT value FROM public.inventory_matrix_dimensions
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
        variant_cost, variant_selling, 0, NULL, TRUE
      );
    ELSE
      UPDATE public.product_variants SET is_active = TRUE WHERE id = existing_variant_id;
    END IF;

    existing_variant_id := NULL;
  END LOOP;
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
  variant_cost NUMERIC;
  variant_selling NUMERIC;
  previous_quantity INTEGER;
  new_quantity INTEGER;
BEGIN
  IF p_quantity < 0 THEN RAISE EXCEPTION 'Stock quantity cannot be negative'; END IF;

  FOR variant_row IN
    SELECT id, stock_quantity FROM public.product_variants
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
    SELECT cost_price, selling_price INTO variant_cost, variant_selling
    FROM public.product_variants
    WHERE product_id = p_product_id AND is_active IS DISTINCT FROM FALSE
    ORDER BY created_at
    LIMIT 1;

    INSERT INTO public.product_variants (
      product_id, size, color, cost_price, selling_price, stock_quantity, barcode_number, is_active
    ) VALUES (p_product_id, btrim(p_size), btrim(p_colour), variant_cost, variant_selling, 0, NULL, TRUE)
    RETURNING id INTO primary_variant_id;
  END IF;

  IF p_quantity > current_total THEN
    change_amount := p_quantity - current_total;
    UPDATE public.product_variants SET stock_quantity = stock_quantity + change_amount
    WHERE id = primary_variant_id
    RETURNING stock_quantity - change_amount, stock_quantity INTO previous_quantity, new_quantity;

    INSERT INTO public.inventory_history (
      variant_id, change_type, quantity_changed, previous_quantity, new_quantity, reason, user_id
    ) VALUES (
      primary_variant_id, 'add', change_amount, previous_quantity, new_quantity,
      'Inventory matrix adjustment', auth.uid()
    );
  ELSIF p_quantity < current_total THEN
    remaining_remove := current_total - p_quantity;
    FOR variant_row IN
      SELECT id, stock_quantity FROM public.product_variants
      WHERE product_id = p_product_id
        AND is_active IS DISTINCT FROM FALSE
        AND lower(btrim(size)) = lower(btrim(p_size))
        AND lower(btrim(color)) = lower(btrim(p_colour))
        AND stock_quantity > 0
      ORDER BY created_at DESC, id DESC
    LOOP
      EXIT WHEN remaining_remove <= 0;
      remove_amount := LEAST(variant_row.stock_quantity, remaining_remove);
      UPDATE public.product_variants SET stock_quantity = stock_quantity - remove_amount
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

ALTER TABLE public.products
  DROP COLUMN IF EXISTS base_cost_price,
  DROP COLUMN IF EXISTS base_selling_price;
