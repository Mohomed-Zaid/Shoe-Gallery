ALTER TABLE products
  ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE products
SET code = CONCAT('PRD-', UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8)))
WHERE code IS NULL OR TRIM(code) = '';

ALTER TABLE products
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_code_key
  ON products(code);
