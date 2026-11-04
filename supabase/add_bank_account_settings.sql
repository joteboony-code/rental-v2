-- ============================================================
-- เพิ่ม field เลขบัญชีธนาคารสำหรับแสดงใน Portal ผู้เช่า
-- ใช้แทน QR PromptPay (ผู้เช่าสามารถคัดลอกเลขบัญชีไปโอนเองได้)
-- ============================================================

alter table public.settings
  add column if not exists bank_account_no   text,   -- เลขบัญชีตัวเลขล้วน (เช่น 9197253892)
  add column if not exists bank_account_name text,   -- ชื่อบัญชี (เช่น นายไพศาล ใจดี)
  add column if not exists bank_name         text;   -- ชื่อธนาคาร (เช่น กสิกรไทย / ttb)
