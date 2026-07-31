ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS barcode_number TEXT;

WITH numbered_variants AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS seq
  FROM product_variants
  WHERE barcode_number IS NULL OR TRIM(barcode_number) = ''
)
UPDATE product_variants AS variants
SET barcode_number = (100000 + numbered_variants.seq)::TEXT
FROM numbered_variants
WHERE variants.id = numbered_variants.id;

ALTER TABLE product_variants
  ALTER COLUMN barcode_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_number_key
  ON product_variants(barcode_number);
