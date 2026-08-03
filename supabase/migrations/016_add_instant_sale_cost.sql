-- Store the cost entered for instant POS items so profit reports remain accurate.
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2);

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_cost_price_check;

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_cost_price_check
  CHECK (cost_price IS NULL OR cost_price >= 0);
