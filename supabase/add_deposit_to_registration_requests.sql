ALTER TABLE public.tenant_registration_requests
  ADD COLUMN IF NOT EXISTS deposit_paid numeric DEFAULT 0;
