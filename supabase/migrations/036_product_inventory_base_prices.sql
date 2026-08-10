-- Base prices shown by the Inventory product summary and matrix header.
-- Stock remains in product_variants; no separate stock sheet is created.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS base_cost_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS base_selling_price NUMERIC(12, 2);

