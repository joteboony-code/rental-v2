-- ปิดช่องโหว่: policy เดิม "public read non-sensitive" เปิด SELECT ทั้งแถวให้ anon
-- (using(true)) ซึ่ง Postgres ไม่มี column-level RLS — ทำให้ใครก็ตามที่ถือ anon key
-- (รวมเบราว์เซอร์ของผู้เช่า) ดึง encrypted_channel_access_token / encrypted_channel_secret
-- ออกมาได้โดยตรงผ่าน PostgREST
--
-- ตอนนี้ getLineIntegrationPublic / getLineMessagingConfig ใน lib/line-integration.ts
-- เปลี่ยนไปใช้ service client (bypass RLS) แล้ว จึงไม่จำเป็นต้องเปิด SELECT ให้ anon อีก
-- เหลือไว้เพียง policy "line_integrations: admin manage" (is_admin()) สำหรับ dashboard

drop policy if exists "line_integrations: public read non-sensitive" on public.line_integrations;

-- กันชั้นสอง: เพิกถอนสิทธิ์ SELECT ระดับตารางออกจาก anon/authenticated
-- (admin เข้าผ่าน is_admin() policy + service role ยัง bypass ได้ตามปกติ)
revoke select on public.line_integrations from anon;
