-- ============================================================
-- MIGRATION: แยก tenants ออกจาก profiles
-- รัน SQL นี้ใน Supabase SQL Editor
-- ============================================================

-- 1. สร้าง tenants table (ไม่ต้องมี Supabase auth account)
create table if not exists public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  phone               text,
  line_user_id        text unique,       -- LINE LIFF user ID (ใช้ match ตอน tenant เปิด LIFF)
  id_card             text,              -- เลขบัตรประชาชน
  emergency_contact   text,              -- ชื่อผู้ติดต่อฉุกเฉิน
  emergency_phone     text,              -- เบอร์ผู้ติดต่อฉุกเฉิน
  note                text,              -- หมายเหตุ
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute procedure public.set_updated_at();

-- RLS สำหรับ tenants
alter table public.tenants enable row level security;
create policy "tenants: admin จัดการ" on public.tenants for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 2. แก้ contracts ให้ tenant_id references tenants แทน profiles
-- (ถ้าไม่มีข้อมูลเก่า ให้ drop FK เดิมแล้วสร้างใหม่)
alter table public.contracts drop constraint if exists contracts_tenant_id_fkey;
alter table public.contracts
  add constraint contracts_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete restrict;

-- 3. แก้ bills ให้ tenant_id references tenants แทน profiles
alter table public.bills drop constraint if exists bills_tenant_id_fkey;
alter table public.bills
  add constraint bills_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete restrict;

-- 4. อัพเดต RLS ของ contracts (เอา tenant_id = auth.uid() ออก เพราะ tenant ไม่มี auth account)
drop policy if exists "contracts: tenant ดูของตัวเอง" on public.contracts;
drop policy if exists "contracts: admin ดูทั้งหมด" on public.contracts;
drop policy if exists "contracts: admin จัดการ" on public.contracts;

create policy "contracts: admin จัดการ" on public.contracts for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 5. อัพเดต RLS ของ bills
drop policy if exists "bills: tenant ดูของตัวเอง" on public.bills;
drop policy if exists "bills: admin จัดการ" on public.bills;

create policy "bills: admin จัดการ" on public.bills for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 6. อัพเดต RLS ของ payments
drop policy if exists "payments: tenant ดูบิลตัวเอง" on public.payments;
drop policy if exists "payments: admin จัดการ" on public.payments;

create policy "payments: admin จัดการ" on public.payments for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 7. อัพเดต RLS ของ meter_readings
drop policy if exists "meter: tenant ดูห้องตัวเอง" on public.meter_readings;
drop policy if exists "meter: admin จัดการ" on public.meter_readings;

create policy "meter: admin จัดการ" on public.meter_readings for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- หมายเหตุ: RLS สำหรับ tenant LIFF portal จะเพิ่มทีหลัง
-- โดยใช้ line_user_id match กับ tenants.line_user_id
