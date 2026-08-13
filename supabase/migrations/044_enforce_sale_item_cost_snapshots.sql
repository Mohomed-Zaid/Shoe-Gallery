-- Freeze the exact variant cost on every inventory sale item at insert time.
-- Reports must never depend on product_variants.cost_price after the sale.
CREATE OR REPLACE FUNCTION public.snapshot_sale_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  variant_cost numeric(12, 2);
BEGIN
  IF NEW.variant_id IS NOT NULL AND coalesce(NEW.is_instant_sale, false) = false THEN
    SELECT cost_price INTO variant_cost
    FROM public.product_variants
    WHERE id = NEW.variant_id;

    NEW.cost_price_at_sale := variant_cost;
    NEW.cost_price := variant_cost;
  ELSIF NEW.cost_price_at_sale IS NULL THEN
    NEW.cost_price_at_sale := NEW.cost_price;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_sale_item_cost_before_insert ON public.sale_items;
CREATE TRIGGER snapshot_sale_item_cost_before_insert
BEFORE INSERT ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_sale_item_cost();

-- One-time legacy repair. Once copied, later inventory price changes cannot
-- alter the historical sale cost.
UPDATE public.sale_items si
SET cost_price_at_sale = coalesce(si.cost_price, pv.cost_price),
    cost_price = coalesce(si.cost_price, pv.cost_price)
FROM public.product_variants pv
WHERE si.variant_id = pv.id
  AND si.cost_price_at_sale IS NULL
  AND coalesce(si.is_instant_sale, false) = false;
