-- Security hardening for privileged RPCs and private tenant documents.
-- Apply after the existing schema/migrations.

begin;

-- These functions bypass RLS. They are called only from guarded server-side code.
revoke all on function public.checkout_tenant(uuid, uuid, uuid, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.checkout_tenant(uuid, uuid, uuid, text, text, uuid[])
  to service_role;

revoke all on function public.apply_multi_bill_payment(jsonb, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_multi_bill_payment(jsonb, text, text, text, text, timestamptz, uuid)
  to service_role;

-- Keep tenant identity documents, signed agreements, and owner signatures private.
update storage.buckets
set public = false
where id = 'tenant-documents';

drop policy if exists "tenant-documents: authenticated read" on storage.objects;
drop policy if exists "tenant-documents: admin read" on storage.objects;
create policy "tenant-documents: admin read"
on storage.objects for select to authenticated
using (bucket_id = 'tenant-documents' and public.is_admin());

-- Delete a bill and its payment history in one transaction.
create or replace function public.admin_delete_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.bills where id = p_bill_id) then
    raise exception 'bill not found' using errcode = 'P0002';
  end if;

  delete from public.payments where bill_id = p_bill_id;
  delete from public.bills where id = p_bill_id;
end;
$$;

revoke all on function public.admin_delete_bill(uuid) from public, anon;
grant execute on function public.admin_delete_bill(uuid) to authenticated;

-- Update the meter reading and bill as one unit.
create or replace function public.admin_update_bill(
  p_bill_id uuid,
  p_water_prev numeric,
  p_water_curr numeric,
  p_electricity_prev numeric,
  p_electricity_curr numeric,
  p_rent_amount numeric,
  p_water_amount numeric,
  p_electricity_amount numeric,
  p_wifi_amount numeric,
  p_trash_amount numeric,
  p_other_amount numeric,
  p_other_note text,
  p_total_amount numeric,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meter_reading_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select meter_reading_id
  into v_meter_reading_id
  from public.bills
  where id = p_bill_id
  for update;

  if not found then
    raise exception 'bill not found' using errcode = 'P0002';
  end if;

  if v_meter_reading_id is not null then
    update public.meter_readings
    set water_prev = p_water_prev,
        water_curr = p_water_curr,
        electricity_prev = p_electricity_prev,
        electricity_curr = p_electricity_curr
    where id = v_meter_reading_id;
  end if;

  update public.bills
  set rent_amount = p_rent_amount,
      water_amount = p_water_amount,
      electricity_amount = p_electricity_amount,
      wifi_amount = p_wifi_amount,
      trash_amount = p_trash_amount,
      other_amount = p_other_amount,
      other_note = p_other_note,
      total_amount = p_total_amount,
      status = p_status
  where id = p_bill_id;
end;
$$;

revoke all on function public.admin_update_bill(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, numeric, text
) from public, anon;
grant execute on function public.admin_update_bill(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, text, numeric, text
) to authenticated;

-- Upsert one room's meter reading and bill atomically. A batch may still report
-- per-room errors, but a failed bill can no longer leave an orphan meter row.
create or replace function public.admin_upsert_meter_and_bill(
  p_room_id uuid,
  p_contract_id uuid,
  p_tenant_id uuid,
  p_billing_month date,
  p_due_date date,
  p_water_prev numeric,
  p_water_curr numeric,
  p_electricity_prev numeric,
  p_electricity_curr numeric,
  p_reading_date date,
  p_water_image_url text,
  p_electricity_image_url text,
  p_rent_amount numeric,
  p_water_amount numeric,
  p_electricity_amount numeric,
  p_wifi_amount numeric,
  p_trash_amount numeric,
  p_total_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meter_id uuid;
  v_bill_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.meter_readings (
    room_id, billing_month, water_prev, water_curr,
    electricity_prev, electricity_curr, recorded_by, reading_date,
    water_image_url, electricity_image_url
  )
  values (
    p_room_id, p_billing_month, p_water_prev, p_water_curr,
    p_electricity_prev, p_electricity_curr, auth.uid(), p_reading_date,
    p_water_image_url, p_electricity_image_url
  )
  on conflict (room_id, billing_month) do update
  set water_prev = excluded.water_prev,
      water_curr = excluded.water_curr,
      electricity_prev = excluded.electricity_prev,
      electricity_curr = excluded.electricity_curr,
      recorded_by = excluded.recorded_by,
      reading_date = excluded.reading_date,
      water_image_url = coalesce(excluded.water_image_url, meter_readings.water_image_url),
      electricity_image_url = coalesce(excluded.electricity_image_url, meter_readings.electricity_image_url)
  returning id into v_meter_id;

  insert into public.bills (
    contract_id, room_id, tenant_id, meter_reading_id, billing_month,
    due_date, rent_amount, water_amount, electricity_amount, wifi_amount,
    trash_amount, other_amount, total_amount, status
  )
  values (
    p_contract_id, p_room_id, p_tenant_id, v_meter_id, p_billing_month,
    p_due_date, p_rent_amount, p_water_amount, p_electricity_amount,
    p_wifi_amount, p_trash_amount, 0, p_total_amount, 'pending'
  )
  on conflict (contract_id, billing_month) do update
  set room_id = excluded.room_id,
      tenant_id = excluded.tenant_id,
      meter_reading_id = excluded.meter_reading_id,
      due_date = excluded.due_date,
      rent_amount = excluded.rent_amount,
      water_amount = excluded.water_amount,
      electricity_amount = excluded.electricity_amount,
      wifi_amount = excluded.wifi_amount,
      trash_amount = excluded.trash_amount,
      other_amount = excluded.other_amount,
      total_amount = excluded.total_amount,
      status = excluded.status
  returning id into v_bill_id;

  return v_bill_id;
end;
$$;

revoke all on function public.admin_upsert_meter_and_bill(
  uuid, uuid, uuid, date, date, numeric, numeric, numeric, numeric, date,
  text, text, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.admin_upsert_meter_and_bill(
  uuid, uuid, uuid, date, date, numeric, numeric, numeric, numeric, date,
  text, text, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

commit;
