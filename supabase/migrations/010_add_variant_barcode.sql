ALTER TABLE product_variants
ADD COLUMN IF NOT EXISTS barcode_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_variants_barcode_number_key'
  ) THEN
    ALTER TABLE product_variants
    ADD CONSTRAINT product_variants_barcode_number_key UNIQUE (barcode_number);
  END IF;
END $$;
