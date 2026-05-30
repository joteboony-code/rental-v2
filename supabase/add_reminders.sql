-- ============================================================
-- Reminder system
-- ============================================================

-- วันที่ส่งแจ้งเตือนในแต่ละเดือน (เช่น "5,10" = วันที่ 5 และ 10)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reminder_days    text    NOT NULL DEFAULT '5,10',
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true;

-- งดแจ้งเตือนรายบิล (ผู้เช่าแจ้งว่าจะจ่ายวันที่ X)
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS snooze_until date,
  ADD COLUMN IF NOT EXISTS snooze_note  text;
