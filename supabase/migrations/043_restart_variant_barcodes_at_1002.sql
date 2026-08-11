-- Restart automatic product variant barcode allocation at 1002.
-- Existing barcodes are preserved. The generator's collision loop skips any
-- candidate that is already assigned to a product variant.

ALTER SEQUENCE public.product_variant_barcode_seq
  INCREMENT BY 1
  MINVALUE 1001
  NO CYCLE;

SELECT pg_catalog.setval(
  'public.product_variant_barcode_seq'::pg_catalog.regclass,
  1002,
  FALSE
);
