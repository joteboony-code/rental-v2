-- เปิด/ปิด OCR สำหรับอ่านเลขมิเตอร์จากรูป (ค่าเริ่มต้นเปิดเพื่อคงพฤติกรรมเดิม)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS meter_ocr_enabled boolean NOT NULL DEFAULT true;
