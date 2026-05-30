-- เกณฑ์ผิดปกติ: ถ้าใช้เพิ่มกว่าเดือนก่อน X% จะแสดงเตือน (default 50%)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS anomaly_threshold_pct integer NOT NULL DEFAULT 50;
