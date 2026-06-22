-- Require AAL2 for admin access only when that user has a verified MFA factor.
-- This protects RLS-backed Server Actions and route handlers even when invoked directly.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  )
  and (
    not exists (
      select 1
      from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
    or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
$$;

-- Previously allowed every authenticated user to approve or reject registrations.
drop policy if exists "admin_all" on public.tenant_registration_requests;
create policy "tenant_registration_requests: admin manage"
  on public.tenant_registration_requests
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Replace broad authenticated access with the MFA-aware admin predicate.
drop policy if exists "auth users can manage leads" on public.leads;
create policy "leads: admin manage"
  on public.leads
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "broadcast_history admin" on public.broadcast_history;
create policy "broadcast_history: admin manage"
  on public.broadcast_history
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Public portal data is served through server-side allowlisted selects; do not expose encrypted columns via REST.
drop policy if exists "line_integrations: public read non-sensitive" on public.line_integrations;

-- Storage writes must be MFA-aware admin operations.
drop policy if exists "auth upload broadcast images" on storage.objects;
create policy "broadcast-images: admin upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'broadcast-images' and public.is_admin());

drop policy if exists "auth delete broadcast images" on storage.objects;
create policy "broadcast-images: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'broadcast-images' and public.is_admin());

drop policy if exists "slips: admin write" on storage.objects;
create policy "slips: admin write"
  on storage.objects for insert
  with check (bucket_id = 'payment-slips' and public.is_admin());

drop policy if exists "slips: admin delete" on storage.objects;
create policy "slips: admin delete"
  on storage.objects for delete
  using (bucket_id = 'payment-slips' and public.is_admin());

drop policy if exists "photos: admin write" on storage.objects;
create policy "photos: admin write"
  on storage.objects for insert
  with check (bucket_id = 'repair-photos' and public.is_admin());

drop policy if exists "tenant-documents: authenticated read" on storage.objects;
create policy "tenant-documents: admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'tenant-documents' and public.is_admin());

-- Atomically consume one rate-limit attempt. Returns true once the caller is over the limit.
create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else limits.count + 1
        end,
        window_start = case
          when limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else limits.window_start
        end
  returning count into v_count;

  return v_count > p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
