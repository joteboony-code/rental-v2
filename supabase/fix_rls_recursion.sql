-- ============================================================
-- FIX: infinite recursion detected in policy for relation "profiles"
-- ปัญหา: policy ที่เช็ค profiles table วนซ้ำตัวเอง
-- แก้ไข: สร้าง is_admin() function แบบ security definer
--         ซึ่งจะ bypass RLS ตอน query profiles → ไม่เกิด loop
-- ============================================================

-- 1. สร้าง helper function (security definer = bypass RLS)
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
-- 2. แก้ profiles policies (ต้นเหตุหลัก)
-- ============================================================
drop policy if exists "profiles: admin ดูทั้งหมด" on public.profiles;
create policy "profiles: admin ดูทั้งหมด" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles: แก้ตัวเอง" on public.profiles;
create policy "profiles: แก้ตัวเอง" on public.profiles
  for update using (auth.uid() = id);

-- ============================================================
-- 3. แก้ settings
-- ============================================================
drop policy if exists "settings: admin แก้ได้" on public.settings;
create policy "settings: admin แก้ได้" on public.settings
  for update using (public.is_admin());

-- ============================================================
-- 4. แก้ rooms
-- ============================================================
drop policy if exists "rooms: admin เพิ่ม/แก้/ลบ" on public.rooms;
create policy "rooms: admin เพิ่ม/แก้/ลบ" on public.rooms
  for all using (public.is_admin());

-- ============================================================
-- 5. แก้ tenants (ถ้ามีตารางแล้ว)
-- ============================================================
drop policy if exists "tenants: admin จัดการ" on public.tenants;
create policy "tenants: admin จัดการ" on public.tenants
  for all using (public.is_admin());

-- ============================================================
-- 6. แก้ contracts
-- ============================================================
drop policy if exists "contracts: tenant ดูของตัวเอง" on public.contracts;
drop policy if exists "contracts: admin ดูทั้งหมด" on public.contracts;
drop policy if exists "contracts: admin จัดการ" on public.contracts;
create policy "contracts: admin จัดการ" on public.contracts
  for all using (public.is_admin());

-- ============================================================
-- 7. แก้ meter_readings
-- ============================================================
drop policy if exists "meter: admin จัดการ" on public.meter_readings;
drop policy if exists "meter: tenant ดูห้องตัวเอง" on public.meter_readings;
create policy "meter: admin จัดการ" on public.meter_readings
  for all using (public.is_admin());

-- ============================================================
-- 8. แก้ bills
-- ============================================================
drop policy if exists "bills: tenant ดูของตัวเอง" on public.bills;
drop policy if exists "bills: admin จัดการ" on public.bills;
create policy "bills: admin จัดการ" on public.bills
  for all using (public.is_admin());

-- ============================================================
-- 9. แก้ payments
-- ============================================================
drop policy if exists "payments: tenant ดูบิลตัวเอง" on public.payments;
drop policy if exists "payments: admin จัดการ" on public.payments;
create policy "payments: admin จัดการ" on public.payments
  for all using (public.is_admin());

-- ============================================================
-- 10. แก้ repair_requests (ถ้ามีตารางแล้ว)
-- ============================================================
drop policy if exists "repairs: admin จัดการ" on public.repair_requests;
create policy "repairs: admin จัดการ" on public.repair_requests
  for all using (public.is_admin());

-- ============================================================
-- เสร็จ ✓ ลอง save settings อีกครั้งได้เลย
-- ============================================================
