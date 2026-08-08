-- Fast product-level item number lookup and active variant support for POS.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_number TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.products
SET item_number = code
WHERE item_number IS NULL OR btrim(item_number) = '';

ALTER TABLE public.products
  ALTER COLUMN item_number SET NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_item_number_format;

ALTER TABLE public.products
  ADD CONSTRAINT products_item_number_format
  CHECK (item_number ~ '^[A-Za-z0-9-]+$');

CREATE UNIQUE INDEX IF NOT EXISTS products_item_number_key
  ON public.products (item_number);

CREATE INDEX IF NOT EXISTS idx_products_lower_name
  ON public.products (lower(name));

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_barcode_number
  ON public.product_variants (barcode_number);

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS item_number_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS barcode_number_snapshot TEXT;
