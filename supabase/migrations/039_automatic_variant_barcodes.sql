-- Generate barcode_number for new variants. Product codes remain independent.

-- Remove the product-code automation introduced by migration 038 without
-- changing any product codes that have already been stored.
DROP TRIGGER IF EXISTS products_assign_generated_code ON public.products;
DROP FUNCTION IF EXISTS public.assign_generated_product_code();
DROP FUNCTION IF EXISTS public.generate_next_product_barcode();
DROP SEQUENCE IF EXISTS public.product_barcode_seq;

CREATE SEQUENCE IF NOT EXISTS public.barcode_number_seq
  AS BIGINT
  INCREMENT BY 1
  MINVALUE 1004
  START WITH 1004
  NO CYCLE;

-- The sequence is intentionally independent of manually entered barcodes.
-- On its first call it returns 1004; subsequent calls are never rolled back or
-- reused after a variant is deleted.
CREATE OR REPLACE FUNCTION public.generate_next_barcode_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := pg_catalog.nextval('public.barcode_number_seq'::pg_catalog.regclass)::TEXT;
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.product_variants
      WHERE barcode_number = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_generated_variant_barcode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.barcode_number IS NULL OR pg_catalog.btrim(NEW.barcode_number) = '' THEN
    NEW.barcode_number := public.generate_next_barcode_number();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_assign_generated_barcode
  ON public.product_variants;
CREATE TRIGGER product_variants_assign_generated_barcode
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_generated_variant_barcode();

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_number_key
  ON public.product_variants (barcode_number);

REVOKE ALL ON SEQUENCE public.barcode_number_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_next_barcode_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_generated_variant_barcode() FROM PUBLIC, anon, authenticated;
