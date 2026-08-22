begin;

alter table public.settings
  add column if not exists interest_gallery_paths text[] not null default '{}';

create or replace function public.increment_interest_view_count()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  update public.settings
  set interest_view_count = coalesce(interest_view_count, 0) + 1
  where id = 1
  returning interest_view_count into new_count;

  return coalesce(new_count, 0);
end;
$$;

revoke all on function public.increment_interest_view_count() from public, anon, authenticated;
grant execute on function public.increment_interest_view_count() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interest-room-photos',
  'interest-room-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "interest-room-photos: public read" on storage.objects;
create policy "interest-room-photos: public read"
  on storage.objects for select to public
  using (bucket_id = 'interest-room-photos');

drop policy if exists "interest-room-photos: admin upload" on storage.objects;
create policy "interest-room-photos: admin upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'interest-room-photos'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "interest-room-photos: admin delete" on storage.objects;
create policy "interest-room-photos: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'interest-room-photos'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
