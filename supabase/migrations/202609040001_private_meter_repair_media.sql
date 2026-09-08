begin;

-- Keep operational photos private. Existing values can remain as old public URLs;
-- the application extracts their object path and creates a short-lived signed URL.
update storage.buckets
set public = false
where id in ('meter-photos', 'repair-photos', 'contract-documents');

drop policy if exists "meter-photos: public read" on storage.objects;
drop policy if exists "photos: public read" on storage.objects;
drop policy if exists "contract-documents: public read" on storage.objects;

drop policy if exists "private operational media: admin read" on storage.objects;
create policy "private operational media: admin read"
on storage.objects for select to authenticated
using (
  bucket_id in ('meter-photos', 'repair-photos', 'contract-documents')
  and public.is_admin()
);

commit;
