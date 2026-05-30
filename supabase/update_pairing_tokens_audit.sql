-- เพิ่ม audit columns ใน pairing_tokens
-- รัน script นี้ใน Supabase SQL Editor ก่อน deploy

ALTER TABLE public.pairing_tokens
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS line_user_id  text,
  ADD COLUMN IF NOT EXISTS display_name  text;

CREATE INDEX IF NOT EXISTS idx_pairing_tokens_cancelled
  ON public.pairing_tokens(cancelled_at)
  WHERE cancelled_at IS NOT NULL;
