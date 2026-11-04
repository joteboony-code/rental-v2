-- ============================================================
-- เพิ่มชุดบัญชีธนาคารต่อแถว (row) สำหรับแสดงใน Portal ผู้เช่า
-- แถวที่ 1 → บัญชีหลัก (เช่น กสิกรไทย)
-- แถวที่ 2 → บัญชีสอง (เช่น กรุงศรี)
-- แถวที่ 3 → บัญชีสาม (เช่น TTB)
-- ห้องที่แถวเกิน 3 จะแสดงข้อความให้ติดต่อเจ้าของหอ
-- ============================================================

alter table public.settings
  -- แถวที่ 1
  add column if not exists bank_name_1    text,
  add column if not exists bank_account_no_1    text,
  add column if not exists bank_account_name_1  text,
  -- แถวที่ 2
  add column if not exists bank_name_2    text,
  add column if not exists bank_account_no_2    text,
  add column if not exists bank_account_name_2  text,
  -- แถวที่ 3
  add column if not exists bank_name_3    text,
  add column if not exists bank_account_no_3    text,
  add column if not exists bank_account_name_3  text;
