-- ============================================================
-- MIGRATION Phase 4–6
-- รัน SQL นี้ใน Supabase SQL Editor
-- ============================================================

-- 1. เพิ่ม PromptPay ใน settings
alter table public.settings
  add column if not exists promptpay_id   text not null default '',
  add column if not exists promptpay_name text not null default 'ห้องเช่า';

-- 2. สร้าง repair_requests table
create table if not exists public.repair_requests (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete set null,
  title       text not null,
  description text,
  photo_url   text,
  status      text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'cancelled')),
  priority    text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger repair_requests_updated_at
  before update on public.repair_requests
  for each row execute procedure public.set_updated_at();

alter table public.repair_requests enable row level security;
create policy "repairs: admin จัดการ" on public.repair_requests for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create index if not exists idx_repairs_room_id    on public.repair_requests(room_id);
create index if not exists idx_repairs_status     on public.repair_requests(status);
create index if not exists idx_repairs_created_at on public.repair_requests(created_at desc);

-- 3. Storage buckets (รัน 2 บรรทัดนี้แยกถ้าเกิด error ว่า bucket มีอยู่แล้ว)
insert into storage.buckets (id, name, public)
  values ('payment-slips', 'payment-slips', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('repair-photos', 'repair-photos', true)
  on conflict (id) do nothing;

-- Storage RLS: ทุกคน read ได้, admin เขียนได้
create policy "slips: public read" on storage.objects for select
  using (bucket_id = 'payment-slips');
create policy "slips: admin write" on storage.objects for insert
  with check (
    bucket_id = 'payment-slips' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "slips: admin delete" on storage.objects for delete
  using (
    bucket_id = 'payment-slips' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "photos: public read" on storage.objects for select
  using (bucket_id = 'repair-photos');
create policy "photos: admin write" on storage.objects for insert
  with check (
    bucket_id = 'repair-photos' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
