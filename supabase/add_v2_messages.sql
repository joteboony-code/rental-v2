-- v2 message system additions

-- Bank accounts text for reminder messages
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS bank_accounts_text text;

-- Slip reference for deduplication
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS slip_ref text;

CREATE INDEX IF NOT EXISTS idx_payments_slip_ref ON public.payments(slip_ref)
  WHERE slip_ref IS NOT NULL;
