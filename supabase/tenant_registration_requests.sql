-- Add registration_token to rooms table (unique token for each room's self-registration QR)
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS registration_token text UNIQUE DEFAULT gen_random_uuid()::text;

-- Backfill tokens for existing rooms
UPDATE public.rooms SET registration_token = gen_random_uuid()::text WHERE registration_token IS NULL;

-- Table for tenant self-registration requests
CREATE TABLE IF NOT EXISTS public.tenant_registration_requests (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id            uuid          NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_number        text          NOT NULL,
  line_user_id       text,
  line_display_name  text,
  line_picture_url   text,
  full_name          text          NOT NULL,
  phone              text          NOT NULL,
  id_card            text,
  move_in_date       date,
  note               text,
  status             text          NOT NULL DEFAULT 'pending'
    CONSTRAINT trr_status_check CHECK (status IN ('pending','approved','rejected','auto_approved')),
  pending_reason     text,
  matched_tenant_id  uuid          REFERENCES public.tenants(id),
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  admin_note         text,
  created_at         timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trr_room_id      ON public.tenant_registration_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_trr_status       ON public.tenant_registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_trr_line_user_id ON public.tenant_registration_requests(line_user_id);
CREATE INDEX IF NOT EXISTS idx_trr_phone        ON public.tenant_registration_requests(phone);
CREATE INDEX IF NOT EXISTS idx_trr_created_at   ON public.tenant_registration_requests(created_at DESC);

ALTER TABLE public.tenant_registration_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all" ON public.tenant_registration_requests;
CREATE POLICY "admin_all" ON public.tenant_registration_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
