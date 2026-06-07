-- Leads / Waiting List — คนที่สนใจเช่าห้องฝากชื่อไว้
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  note       text,
  status     text not null default 'new'
               check (status in ('new', 'contacted', 'converted', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

-- คนทั่วไปส่งฟอร์มได้ (no auth)
create policy "public can submit lead"
  on public.leads for insert
  with check (true);

-- เจ้าของดู/แก้ไข/ลบได้
create policy "auth users can manage leads"
  on public.leads for all
  to authenticated
  using (true)
  with check (true);

create index if not exists idx_leads_status     on public.leads(status);
create index if not exists idx_leads_created_at on public.leads(created_at desc);
