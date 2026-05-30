-- เพิ่มคอลัมน์ owner_line_user_id ใน line_integrations
-- ใช้เก็บ LINE User ID ของเจ้าของหอ (สำหรับแจ้งเตือน admin เมื่อมีสลิป/ข้อความเข้า)
ALTER TABLE public.line_integrations
  ADD COLUMN IF NOT EXISTS owner_line_user_id text;
