-- ============================================================
-- Feature batch v2
-- ============================================================

-- 1. WiFi fee per room (optional — NULL = no wifi)
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS wifi_fee numeric(10,2);

-- 2. Trash fee in settings (default ฿50/room/month)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS trash_fee numeric(10,2) NOT NULL DEFAULT 50;

-- 3. Current billing month tracker in settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS current_billing_month date;
UPDATE public.settings
  SET current_billing_month = date_trunc('month', now())::date
  WHERE current_billing_month IS NULL;

-- 4. WiFi / trash amounts in bills (separate columns)
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS wifi_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trash_amount numeric(10,2) NOT NULL DEFAULT 0;

-- 5. Contract document images stored per tenant
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS contract_images text[] NOT NULL DEFAULT '{}';

-- Done!
-- Remember to create Supabase Storage bucket "contract-documents" (public read)
