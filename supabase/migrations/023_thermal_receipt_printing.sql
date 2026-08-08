ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS receipt_printing TEXT NOT NULL DEFAULT 'automatic' CHECK (receipt_printing IN ('ask','automatic','none'));
