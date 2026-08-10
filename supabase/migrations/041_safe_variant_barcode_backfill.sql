-- Make variant barcodes complete, permanent, unique, and database-generated.
-- Manual/manufacturer barcodes are preserved. Only NULL/blank values are filled.

LOCK TABLE public.product_variants IN SHARE ROW EXCLUSIVE MODE;

-- Stop with an actionable diagnostic before changing data when historical
-- non-blank barcodes collide (including values that differ only by whitespace).
DO $$
DECLARE
  duplicate_summary TEXT;
BEGIN
  SELECT string_agg(format('%L (%s variants)', barcode, duplicate_count), ', ' ORDER BY barcode)
  INTO duplicate_summary
  FROM (
    SELECT btrim(barcode_number) AS barcode, count(*) AS duplicate_count
    FROM public.product_variants
    WHERE barcode_number IS NOT NULL
      AND btrim(barcode_number) <> ''
    GROUP BY btrim(barcode_number)
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION
      'Duplicate product variant barcodes must be resolved before migration: %',
      duplicate_summary;
  END IF;
END;
$$;

-- Whitespace is not part of a barcode. This also turns blank values into NULL
-- so the backfill predicate has one canonical representation.
UPDATE public.product_variants
SET barcode_number = NULLIF(btrim(barcode_number), '')
WHERE barcode_number IS DISTINCT FROM NULLIF(btrim(barcode_number), '');

CREATE SEQUENCE IF NOT EXISTS public.product_variant_barcode_seq
  AS BIGINT
  INCREMENT BY 1
  MINVALUE 1001
  START WITH 1001
  NO CYCLE;

ALTER SEQUENCE public.product_variant_barcode_seq
  INCREMENT BY 1
  MINVALUE 1001
  NO CYCLE;

CREATE OR REPLACE FUNCTION public.generate_next_product_variant_barcode()
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
    candidate := pg_catalog.nextval(
      'public.product_variant_barcode_seq'::pg_catalog.regclass
    )::TEXT;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.product_variants
      WHERE barcode_number = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

-- Synchronize before backfilling. Four-to-nine digit numeric values beginning
-- at 1001 are treated as historical generated values; long EAN/UPC values are
-- manufacturer barcodes and do not push the internal sequence into trillions.
-- Preserve the state of migration 039's old sequence too, including numbers
-- consumed by variants that were later deleted.
DO $$
DECLARE
  highest_generated BIGINT;
  current_last BIGINT;
  current_called BOOLEAN;
  old_last BIGINT := 1000;
  old_called BOOLEAN := FALSE;
  sequence_floor BIGINT;
BEGIN
  SELECT max(barcode_number::BIGINT)
  INTO highest_generated
  FROM public.product_variants
  WHERE barcode_number ~ '^[0-9]{4,9}$'
    AND barcode_number::NUMERIC >= 1001;

  SELECT last_value, is_called
  INTO current_last, current_called
  FROM public.product_variant_barcode_seq;

  IF pg_catalog.to_regclass('public.barcode_number_seq') IS NOT NULL THEN
    EXECUTE 'SELECT last_value, is_called FROM public.barcode_number_seq'
      INTO old_last, old_called;
  END IF;

  sequence_floor := greatest(
    coalesce(highest_generated, 1000),
    CASE WHEN current_called THEN current_last ELSE 1000 END,
    CASE WHEN old_called THEN old_last ELSE 1000 END
  );

  IF sequence_floor < 1001 THEN
    PERFORM pg_catalog.setval(
      'public.product_variant_barcode_seq'::pg_catalog.regclass,
      1001,
      FALSE
    );
  ELSE
    PERFORM pg_catalog.setval(
      'public.product_variant_barcode_seq'::pg_catalog.regclass,
      sequence_floor,
      TRUE
    );
  END IF;
END;
$$;

-- Deterministic one-time fill for historical variants.
DO $$
DECLARE
  variant_row RECORD;
BEGIN
  FOR variant_row IN
    SELECT id
    FROM public.product_variants
    WHERE barcode_number IS NULL
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
    UPDATE public.product_variants
    SET barcode_number = public.generate_next_product_variant_barcode()
    WHERE id = variant_row.id
      AND barcode_number IS NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_generated_product_variant_barcode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.barcode_number := NULLIF(pg_catalog.btrim(NEW.barcode_number), '');

  IF NEW.barcode_number IS NULL THEN
    NEW.barcode_number := public.generate_next_product_variant_barcode();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_assign_generated_barcode
  ON public.product_variants;
DROP TRIGGER IF EXISTS product_variants_assign_automatic_barcode
  ON public.product_variants;

CREATE TRIGGER product_variants_assign_automatic_barcode
  BEFORE INSERT ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_generated_product_variant_barcode();

ALTER TABLE public.product_variants
  ALTER COLUMN barcode_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_number_key
  ON public.product_variants (barcode_number);

REVOKE ALL ON SEQUENCE public.product_variant_barcode_seq
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_next_product_variant_barcode()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_generated_product_variant_barcode()
  FROM PUBLIC, anon, authenticated;

-- Verification: both result sets must be empty after this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_variants
    WHERE barcode_number IS NULL OR btrim(barcode_number) = ''
  ) THEN
    RAISE EXCEPTION 'Variant barcode backfill verification failed: missing barcode';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_variants
    GROUP BY barcode_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Variant barcode backfill verification failed: duplicate barcode';
  END IF;
END;
$$;
