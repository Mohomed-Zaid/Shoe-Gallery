-- Preserve the physical cash handed over separately from accounting paid amount.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_tendered NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS change_due NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE public.sales
SET amount_tendered = paid_amount
WHERE payment_method = 'cash' AND amount_tendered IS NULL;

