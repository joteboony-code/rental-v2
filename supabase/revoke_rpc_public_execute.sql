-- =============================================================================
-- Revoke PUBLIC EXECUTE on SECURITY DEFINER portal/pairing RPCs
-- เพื่อป้องกันการเรียกตรงผ่าน Supabase REST API โดยไม่ผ่าน Next.js
-- =============================================================================

-- get_tenant_portal_by_line_user: เรียกได้เฉพาะผ่าน service role (Next.js server)
REVOKE EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_portal_by_line_user(uuid, uuid) FROM authenticated;

-- pair_tenant_line: เรียกได้เฉพาะผ่าน service role (Next.js server)
-- Note: ลอง REVOKE ทุก overload ที่อาจมี
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_tenant_portal_by_line_user', 'pair_tenant_line')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
    RAISE NOTICE 'Revoked EXECUTE on %(%)', r.proname, r.args;
  END LOOP;
END
$$;

-- ยืนยัน service role ยังเรียกได้ (service role ไม่ได้รับผลจาก REVOKE นี้
-- เพราะ service role bypass RLS และมีสิทธิ์ superuser-equivalent)


-- =============================================================================
-- LINE webhook event idempotency table (P2)
-- เก็บ webhookEventId ที่ประมวลผลไปแล้ว เพื่อป้องกัน LINE retry ประมวลผลซ้ำ
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.processed_line_events (
  event_id    TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ล้างข้อมูลเก่ากว่า 7 วันอัตโนมัติ (ผ่าน cron หรือ pg_cron ถ้ามี)
-- ถ้าไม่มี pg_cron ให้เรียก: DELETE FROM processed_line_events WHERE processed_at < now() - INTERVAL '7 days'
-- ใน daily cron job

-- ป้องกัน anon/authenticated อ่าน/เขียนตาราง
ALTER TABLE public.processed_line_events ENABLE ROW LEVEL SECURITY;
-- ไม่สร้าง policy → ไม่มีใครเข้าได้นอกจาก service role (BYPASSRLS)
