-- เพิ่ม column รูปมิเตอร์
alter table public.meter_readings
  add column if not exists water_image_url       text,
  add column if not exists electricity_image_url text;

-- Storage bucket สำหรับรูปมิเตอร์ (public read)
insert into storage.buckets (id, name, public)
values ('meter-photos', 'meter-photos', true)
on conflict (id) do nothing;

-- Admin อัปโหลด/ลบได้
create policy "meter-photos: admin upload"
  on storage.objects for insert
  with check (bucket_id = 'meter-photos' and public.is_admin());

create policy "meter-photos: admin delete"
  on storage.objects for delete
  using (bucket_id = 'meter-photos' and public.is_admin());

-- ทุกคนอ่านได้ (public bucket)
create policy "meter-photos: public read"
  on storage.objects for select
  using (bucket_id = 'meter-photos');
