-- ============================================================
-- เพิ่มกลางแถว 4-5 สำหรับระบบ "บัญชีธนาคารต้อแถว"
-- (แถว 1-3 มีอยู่แล้วใน add_bank_account_by_row.sql)
-- เป็นการ migratiion เสริม — รันใน Supabase SQL Editor เป็นไฟล์เดียวได้
-- ============================================================

alter table public.settings
  -- แถวที่ 4
  add column if not exists bank_name_4    text,
  add column if not exists bank_account_no_4    text,
  add column if not exists bank_account_name_4  text,
  -- แถวที่ 5
  add column if not exists bank_name_5    text,
  add column if not exists bank_account_no_5    text,
  add column if not exists bank_account_name_5  text;
