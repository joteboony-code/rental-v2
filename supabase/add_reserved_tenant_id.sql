-- เพิ่ม foreign key ไปยัง tenants สำหรับการจองโดยผู้เช่าที่มีในระบบแล้ว
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS reserved_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
