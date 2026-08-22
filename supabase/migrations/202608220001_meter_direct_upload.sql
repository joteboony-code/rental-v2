begin;

update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'meter-photos';

drop policy if exists "meter-photos: admin upload" on storage.objects;
create policy "meter-photos: admin upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meter-photos'
    and public.is_admin()
    and (
      (storage.foldername(name))[1] <> 'drafts'
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

drop policy if exists "meter-photos: admin delete" on storage.objects;
create policy "meter-photos: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meter-photos'
    and public.is_admin()
    and (
      (storage.foldername(name))[1] <> 'drafts'
      or (storage.foldername(name))[2] = auth.uid()::text
    )
  );

commit;
