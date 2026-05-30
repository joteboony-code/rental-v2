-- ============================================================
-- ระบบจัดการห้องเช่า — COMPLETE DATABASE SCHEMA
-- รันทั้งหมดใน Supabase SQL Editor ครั้งเดียว
-- (สำหรับ project ใหม่ที่ยังไม่มีตารางใดเลย)
-- ============================================================


-- ============================================================
-- 0. UTILITY FUNCTIONS
-- ============================================================

-- auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- 1. PROFILES (admin / staff ที่มี Supabase auth account)
-- ============================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  role       text not null default 'tenant'
    check (role in ('admin', 'tenant')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-create profile เมื่อ user สมัคร
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'tenant')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();


-- ============================================================
-- 2. SETTINGS (singleton row — ค่าตั้งค่าระบบ)
-- ============================================================
create table public.settings (
  id                     int primary key default 1 check (id = 1),
  water_unit_price       numeric(10,2) not null default 18.00,   -- บาท/หน่วย
  electricity_unit_price numeric(10,2) not null default 8.00,    -- บาท/หน่วย
  late_fee_per_day       numeric(10,2) not null default 50.00,   -- ค่าปรับต่อวัน
  billing_day            int not null default 1                  -- วันออกบิล (1-28)
    check (billing_day between 1 and 28),
  due_day                int not null default 10                 -- วันครบกำหนด (1-28)
    check (due_day between 1 and 28),
  promptpay_id           text not null default '',               -- เบอร์/เลขบัตร PromptPay
  promptpay_name         text not null default 'ห้องเช่า',       -- ชื่อที่แสดงใต้ QR
  slipok_branch_id       text,                                   -- SlipOK Branch ID
  slipok_api_key         text,                                   -- SlipOK API Key
  updated_at             timestamptz not null default now()
);

insert into public.settings default values;

create trigger settings_updated_at
  before update on public.settings
  for each row execute procedure public.set_updated_at();


-- ============================================================
-- 3. ROOMS (ห้องเช่า)
-- ============================================================
create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  room_number  text not null unique,
  floor        int,
  room_type    text not null default 'standard'
    check (room_type in ('standard', 'deluxe', 'suite')),
  size_sqm     numeric(6,2),
  monthly_rent numeric(10,2) not null,
  deposit      numeric(10,2) not null default 0,
  status       text not null default 'available'
    check (status in ('available', 'occupied', 'maintenance', 'reserved')),
  description  text,
  image_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger rooms_updated_at
  before update on public.rooms
  for each row execute procedure public.set_updated_at();

create index idx_rooms_status on public.rooms(status);


-- ============================================================
-- 4. TENANTS (ผู้เช่า — ไม่ต้องมี Supabase auth account)
--    ใช้ LINE LIFF สำหรับ portal ผู้เช่า
-- ============================================================
create table public.tenants (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  phone             text,
  line_user_id      text unique,       -- LINE LIFF user ID (match ตอนเปิด LIFF)
  id_card           text,              -- เลขบัตรประชาชน
  emergency_contact text,              -- ชื่อผู้ติดต่อฉุกเฉิน
  emergency_phone   text,              -- เบอร์ผู้ติดต่อฉุกเฉิน
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute procedure public.set_updated_at();


-- ============================================================
-- 5. CONTRACTS (สัญญาเช่า)
-- ============================================================
create table public.contracts (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id),
  tenant_id    uuid not null references public.tenants(id) on delete restrict,
  start_date   date not null,
  end_date     date,
  monthly_rent numeric(10,2) not null,
  deposit_paid numeric(10,2) not null default 0,
  status       text not null default 'active'
    check (status in ('active', 'expired', 'terminated')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger contracts_updated_at
  before update on public.contracts
  for each row execute procedure public.set_updated_at();

create index idx_contracts_room_id   on public.contracts(room_id);
create index idx_contracts_tenant_id on public.contracts(tenant_id);
create index idx_contracts_status    on public.contracts(status);

-- auto-update room status เมื่อสัญญาเปลี่ยน
create or replace function public.sync_room_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' then
    update public.rooms set status = 'occupied' where id = new.room_id;
  elsif new.status in ('expired', 'terminated') then
    update public.rooms set status = 'available' where id = new.room_id;
  end if;
  return new;
end;
$$;

create trigger contracts_sync_room
  after insert or update of status on public.contracts
  for each row execute procedure public.sync_room_status();


-- ============================================================
-- 6. METER_READINGS (ค่ามิเตอร์น้ำ/ไฟ)
-- ============================================================
create table public.meter_readings (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.rooms(id),
  billing_month    date not null,           -- วันที่ 1 ของเดือน เช่น 2026-06-01
  water_prev       numeric(10,2) not null default 0,
  water_curr       numeric(10,2) not null default 0,
  electricity_prev numeric(10,2) not null default 0,
  electricity_curr numeric(10,2) not null default 0,
  recorded_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  unique (room_id, billing_month)
);

-- computed columns
alter table public.meter_readings
  add column water_units       numeric(10,2) generated always as (water_curr - water_prev) stored,
  add column electricity_units numeric(10,2) generated always as (electricity_curr - electricity_prev) stored;

create index idx_meter_room_month on public.meter_readings(room_id, billing_month);


-- ============================================================
-- 7. BILLS (บิลค่าเช่ารายเดือน)
-- ============================================================
create table public.bills (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid not null references public.contracts(id),
  room_id            uuid not null references public.rooms(id),
  tenant_id          uuid not null references public.tenants(id) on delete restrict,
  meter_reading_id   uuid references public.meter_readings(id),
  billing_month      date not null,
  due_date           date not null,
  rent_amount        numeric(10,2) not null,
  water_amount       numeric(10,2) not null default 0,
  electricity_amount numeric(10,2) not null default 0,
  other_amount       numeric(10,2) not null default 0,
  other_note         text,
  total_amount       numeric(10,2) not null,
  status             text not null default 'pending'
    check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (contract_id, billing_month)
);

create trigger bills_updated_at
  before update on public.bills
  for each row execute procedure public.set_updated_at();

create index idx_bills_tenant_id     on public.bills(tenant_id);
create index idx_bills_room_id       on public.bills(room_id);
create index idx_bills_billing_month on public.bills(billing_month);
create index idx_bills_status        on public.bills(status);


-- ============================================================
-- 8. PAYMENTS (การชำระเงิน)
-- ============================================================
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references public.bills(id),
  amount         numeric(10,2) not null,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'transfer', 'qr', 'other')),
  slip_url       text,                     -- URL รูปสลิปใน Supabase Storage
  note           text,
  paid_at        timestamptz not null default now(),
  recorded_by    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

-- auto-update bill status เมื่อชำระครบ
create or replace function public.sync_bill_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total_paid numeric(10,2);
  v_total_due  numeric(10,2);
begin
  select coalesce(sum(p.amount), 0) into v_total_paid
    from public.payments p where p.bill_id = new.bill_id;
  select b.total_amount into v_total_due
    from public.bills b where b.id = new.bill_id;
  if v_total_paid >= v_total_due then
    update public.bills set status = 'paid' where id = new.bill_id;
  end if;
  return new;
end;
$$;

create trigger payments_sync_bill
  after insert on public.payments
  for each row execute procedure public.sync_bill_paid();

create index idx_payments_bill_id on public.payments(bill_id);


-- ============================================================
-- 9. REPAIR_REQUESTS (แจ้งซ่อม)
-- ============================================================
create table public.repair_requests (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete set null,
  title       text not null,
  description text,
  photo_url   text,                    -- URL รูปปัญหาใน Supabase Storage
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

create index idx_repairs_room_id    on public.repair_requests(room_id);
create index idx_repairs_status     on public.repair_requests(status);
create index idx_repairs_created_at on public.repair_requests(created_at desc);


-- ============================================================
-- 10. HELPER FUNCTION (ป้องกัน infinite recursion)
-- ============================================================

-- security definer = bypass RLS ตอน query profiles
-- ทำให้ policy ที่เช็ค admin ไม่วนซ้ำ
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;


-- ============================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- profiles
alter table public.profiles enable row level security;
create policy "profiles: ดูตัวเอง"        on public.profiles for select using (auth.uid() = id);
create policy "profiles: admin ดูทั้งหมด" on public.profiles for select using (public.is_admin());
create policy "profiles: แก้ตัวเอง"       on public.profiles for update using (auth.uid() = id);

-- settings
alter table public.settings enable row level security;
create policy "settings: อ่านได้ทุกคน"    on public.settings for select using (auth.uid() is not null);
create policy "settings: admin แก้ได้"    on public.settings for update using (public.is_admin());

-- rooms
alter table public.rooms enable row level security;
create policy "rooms: อ่านได้ทุกคน"       on public.rooms for select using (auth.uid() is not null);
create policy "rooms: admin เพิ่ม/แก้/ลบ" on public.rooms for all using (public.is_admin());

-- tenants (admin only — tenant เข้าผ่าน LIFF ไม่ผ่าน Supabase auth)
alter table public.tenants enable row level security;
create policy "tenants: admin จัดการ"     on public.tenants for all using (public.is_admin());

-- contracts (admin only)
alter table public.contracts enable row level security;
create policy "contracts: admin จัดการ"   on public.contracts for all using (public.is_admin());

-- meter_readings (admin only)
alter table public.meter_readings enable row level security;
create policy "meter: admin จัดการ"       on public.meter_readings for all using (public.is_admin());

-- bills (admin only)
alter table public.bills enable row level security;
create policy "bills: admin จัดการ"       on public.bills for all using (public.is_admin());

-- payments (admin only)
alter table public.payments enable row level security;
create policy "payments: admin จัดการ"    on public.payments for all using (public.is_admin());

-- repair_requests (admin only)
alter table public.repair_requests enable row level security;
create policy "repairs: admin จัดการ"     on public.repair_requests for all using (public.is_admin());


-- ============================================================
-- 11. STORAGE BUCKETS
-- ============================================================

-- สลิปการชำระเงิน
insert into storage.buckets (id, name, public)
  values ('payment-slips', 'payment-slips', true)
  on conflict (id) do nothing;

-- รูปภาพการแจ้งซ่อม
insert into storage.buckets (id, name, public)
  values ('repair-photos', 'repair-photos', true)
  on conflict (id) do nothing;

-- RLS ของ storage
create policy "slips: public read"   on storage.objects for select
  using (bucket_id = 'payment-slips');
create policy "slips: admin write"   on storage.objects for insert
  with check (
    bucket_id = 'payment-slips' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "slips: admin delete"  on storage.objects for delete
  using (
    bucket_id = 'payment-slips' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "photos: public read"  on storage.objects for select
  using (bucket_id = 'repair-photos');
create policy "photos: admin write"  on storage.objects for insert
  with check (
    bucket_id = 'repair-photos' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "photos: admin delete" on storage.objects for delete
  using (
    bucket_id = 'repair-photos' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );


-- ============================================================
-- เสร็จสิ้น ✓
-- ตารางทั้งหมด 8 ตาราง:
--   profiles, settings, rooms, tenants,
--   contracts, meter_readings, bills, payments, repair_requests
-- Storage buckets: payment-slips, repair-photos
-- ============================================================
