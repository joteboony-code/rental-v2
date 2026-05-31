-- แยก LIFF ID สำหรับหน้าจับคู่ (endpoint = /portal/pair) ออกจาก LIFF ID ของพอร์ทัลบิล (endpoint = /portal)
alter table public.line_integrations
  add column if not exists line_liff_id_pairing text;
