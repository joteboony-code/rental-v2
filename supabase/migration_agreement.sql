-- ============================================================
-- MIGRATION: เพิ่ม fields สำหรับระบบสัญญาเช่า Digital
-- รัน SQL นี้ใน Supabase SQL Editor
-- ============================================================

-- 1. เพิ่ม address ใน tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address text;

-- 2. เพิ่ม agreement fields ใน contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS agreement_pdf_url text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- 3. เพิ่ม owner info ใน settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS owner_id_card text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS owner_address text;

-- 4. สร้าง Storage bucket สำหรับ signed agreements (ถ้ายังไม่มี)
-- ทำใน Supabase Dashboard → Storage → New bucket → ชื่อ "tenant-documents" (public)
-- หรือรัน SQL นี้:
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-documents', 'tenant-documents', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: ให้ service role upload ได้ (portal ใช้ service client)
CREATE POLICY IF NOT EXISTS "tenant-documents: service role all"
ON storage.objects FOR ALL
USING (bucket_id = 'tenant-documents')
WITH CHECK (bucket_id = 'tenant-documents');
