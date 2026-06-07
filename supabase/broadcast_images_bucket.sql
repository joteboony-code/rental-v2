-- Bucket สำหรับรูปประกาศ broadcast
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'broadcast-images',
  'broadcast-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
) on conflict (id) do nothing;

-- อนุญาตให้ admin upload
drop policy if exists "auth upload broadcast images" on storage.objects;
create policy "auth upload broadcast images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'broadcast-images');

-- อนุญาตให้ทุกคนอ่าน (รูปส่งผ่าน LINE ต้องเป็น public URL)
drop policy if exists "public read broadcast images" on storage.objects;
create policy "public read broadcast images"
  on storage.objects for select to anon
  using (bucket_id = 'broadcast-images');

-- อนุญาตให้ admin ลบ
drop policy if exists "auth delete broadcast images" on storage.objects;
create policy "auth delete broadcast images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'broadcast-images');
