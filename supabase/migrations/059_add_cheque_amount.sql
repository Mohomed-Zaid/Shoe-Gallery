ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS amount numeric(12, 2) NOT NULL DEFAULT 0
  CHECK (amount >= 0);

COMMENT ON COLUMN public.cheques.amount IS 'Cheque value in LKR.';
