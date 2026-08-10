-- Generate main-product codes in PostgreSQL so concurrent inserts cannot collide.
-- Variant/manufacturer barcodes remain in product_variants.barcode_number.
CREATE SEQUENCE IF NOT EXISTS public.product_barcode_seq
  AS BIGINT
  INCREMENT BY 1
  MINVALUE 1001
  START WITH 1001
  NO CYCLE;

DO $$
DECLARE
  highest_existing_code BIGINT;
  sequence_last_value BIGINT;
  sequence_was_called BOOLEAN;
BEGIN
  SELECT MAX(item_number::BIGINT)
  INTO highest_existing_code
  FROM public.products
  WHERE item_number ~ '^[0-9]+$'
    AND item_number::NUMERIC >= 1001;

  SELECT last_value, is_called
  INTO sequence_last_value, sequence_was_called
  FROM public.product_barcode_seq;

  highest_existing_code := GREATEST(
    COALESCE(highest_existing_code, 1000),
    CASE WHEN sequence_was_called THEN sequence_last_value ELSE 1000 END
  );

  IF highest_existing_code < 1001 THEN
    PERFORM pg_catalog.setval('public.product_barcode_seq', 1001, FALSE);
  ELSE
    PERFORM pg_catalog.setval('public.product_barcode_seq', highest_existing_code, TRUE);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_next_product_barcode()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.nextval('public.product_barcode_seq'::pg_catalog.regclass)::TEXT;
$$;

CREATE OR REPLACE FUNCTION public.assign_generated_product_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  generated_code TEXT;
BEGIN
  IF (NEW.item_number IS NULL OR pg_catalog.btrim(NEW.item_number) = '')
     AND (NEW.code IS NULL OR pg_catalog.btrim(NEW.code) = '') THEN
    generated_code := public.generate_next_product_barcode();
    NEW.item_number := generated_code;
    NEW.code := generated_code;
  ELSIF NEW.item_number IS NULL OR pg_catalog.btrim(NEW.item_number) = '' THEN
    NEW.item_number := NEW.code;
  ELSIF NEW.code IS NULL OR pg_catalog.btrim(NEW.code) = '' THEN
    NEW.code := NEW.item_number;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_assign_generated_code ON public.products;
CREATE TRIGGER products_assign_generated_code
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_generated_product_code();

-- These unique indexes already exist in normal installations. Reassert them so
-- deployments upgraded from older schemas receive the same duplicate guard.
CREATE UNIQUE INDEX IF NOT EXISTS products_code_key
  ON public.products (code);

CREATE UNIQUE INDEX IF NOT EXISTS products_item_number_key
  ON public.products (item_number);

REVOKE ALL ON SEQUENCE public.product_barcode_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_next_product_barcode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_generated_product_code() FROM PUBLIC, anon, authenticated;

