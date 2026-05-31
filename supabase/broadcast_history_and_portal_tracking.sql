-- Feature 1: ประวัติการประกาศ (broadcast history)
create table if not exists public.broadcast_history (
  id                  uuid primary key default gen_random_uuid(),
  message             text not null,
  image_url           text,
  target_room_numbers text,            -- "ทุกห้อง" หรือ "1, 2, 3"
  recipient_count     int  not null default 0,
  sent_count          int  not null default 0,
  failed_count        int  not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists idx_broadcast_history_created_at
  on public.broadcast_history (created_at desc);

alter table public.broadcast_history enable row level security;

drop policy if exists "broadcast_history admin" on public.broadcast_history;
create policy "broadcast_history admin" on public.broadcast_history
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Feature 2: บันทึกเวลาที่ผู้เช่าเปิด portal ล่าสุด
alter table public.tenants
  add column if not exists last_portal_open_at timestamptz;
