ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS barcode_label_width_mm NUMERIC(6,2) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS barcode_label_height_mm NUMERIC(6,2) NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS barcode_orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (barcode_orientation IN ('portrait','landscape')),
  ADD COLUMN IF NOT EXISTS barcode_horizontal_offset_mm NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS barcode_vertical_offset_mm NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS barcode_width NUMERIC(4,2) NOT NULL DEFAULT 1.35,
  ADD COLUMN IF NOT EXISTS barcode_height NUMERIC(6,2) NOT NULL DEFAULT 38,
  ADD COLUMN IF NOT EXISTS barcode_show_product_name BOOLEAN NOT NULL DEFAULT false;
