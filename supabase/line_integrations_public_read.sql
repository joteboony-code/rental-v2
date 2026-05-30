-- อนุญาตให้ทุกคนอ่าน field ที่ไม่ sensitive ของ line_integrations
-- (LIFF ID, OA Basic ID, app_url) สำหรับ tenant portal
-- encrypted_channel_access_token และ encrypted_channel_secret ยังคงซ่อนอยู่
-- เพราะ SELECT policy นี้ไม่ได้ยกเว้น RLS ของ column — แต่ admin policy ครอบ all ไว้แล้ว
-- แค่เพิ่ม SELECT สำหรับ anon/authenticated ทั่วไป

drop policy if exists "line_integrations: public read non-sensitive" on public.line_integrations;

create policy "line_integrations: public read non-sensitive"
  on public.line_integrations
  for select
  using (true);
