-- ตาราง pairing tokens สำหรับจับคู่ห้องกับผู้เช่าผ่าน LINE
CREATE TABLE IF NOT EXISTS public.pairing_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token      text        NOT NULL UNIQUE,   -- 6 ตัวอักษร เช่น "A3X9K2"
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pairing_tokens_token     ON public.pairing_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pairing_tokens_tenant_id ON public.pairing_tokens(tenant_id);

-- RLS: admin จัดการได้ทั้งหมด (สร้าง/ลบ token), webhook ใช้ service role bypass RLS เอง
ALTER TABLE public.pairing_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pairing_tokens: admin manage" ON public.pairing_tokens;
CREATE POLICY "pairing_tokens: admin manage"
  ON public.pairing_tokens
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
