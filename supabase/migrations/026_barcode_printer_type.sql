ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS barcode_printer_type TEXT NOT NULL DEFAULT 'thermal_label' CHECK (barcode_printer_type = 'thermal_label');
