-- ============================================================
-- FIX: ล็อค Storage policy สำหรับ tenant-documents
-- เดิม: FOR ALL ไม่มี role restriction → anon เขียน/ลบได้
-- ใหม่: อ่านได้เฉพาะ authenticated (admin), เขียนผ่าน service_role เท่านั้น
-- ============================================================

-- ลบ policy เก่าที่อนุญาต anon ทำ FOR ALL
DROP POLICY IF EXISTS "tenant-documents: service role all" ON storage.objects;

-- SELECT: authenticated เท่านั้น (admin dashboard)
-- หมายเหตุ: public bucket URL (/storage/v1/object/public/...) ยังใช้ได้โดยไม่ต้อง auth
CREATE POLICY "tenant-documents: authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'tenant-documents');

-- INSERT/UPDATE/DELETE: ไม่มี explicit policy → เฉพาะ service_role เท่านั้น (bypass RLS)
-- Server actions ทั้งหมดใช้ createServiceClient() สำหรับอัพโหลด

-- =========================================================
-- ดัชนีป้องกัน double-booking: ห้องหนึ่งมี active contract ได้แค่ 1 สัญญา
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_room_active
ON public.contracts (room_id)
WHERE status = 'active';
