begin;

create table if not exists public.meter_baseline_adjustments (
  id                         uuid primary key default gen_random_uuid(),
  room_id                    uuid not null references public.rooms(id) on delete restrict,
  effective_billing_month    date not null,
  previous_water_baseline    numeric(10,2) not null,
  previous_electric_baseline numeric(10,2) not null,
  water_baseline             numeric(10,2) not null check (water_baseline >= 0),
  electricity_baseline       numeric(10,2) not null check (electricity_baseline >= 0),
  reason_code                text not null check (reason_code in ('repair', 'meter_replaced', 'meter_fault', 'owner_usage', 'other')),
  reason_note                text,
  water_image_url            text,
  electricity_image_url      text,
  created_by                 uuid references public.profiles(id) on delete set null,
  created_at                 timestamptz not null default now(),
  cancelled_by               uuid references public.profiles(id) on delete set null,
  cancelled_at               timestamptz,
  cancellation_note          text,
  check (date_trunc('month', effective_billing_month)::date = effective_billing_month)
);

create unique index if not exists idx_meter_baseline_adjustments_active
  on public.meter_baseline_adjustments (room_id, effective_billing_month)
  where cancelled_at is null;

create index if not exists idx_meter_baseline_adjustments_history
  on public.meter_baseline_adjustments (created_at desc);

alter table public.meter_baseline_adjustments enable row level security;

drop policy if exists "meter baseline: admin manage" on public.meter_baseline_adjustments;
create policy "meter baseline: admin manage"
  on public.meter_baseline_adjustments
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.meter_baseline_adjustments to authenticated;

create or replace function public.admin_set_meter_baseline(
  p_room_id uuid,
  p_effective_billing_month date,
  p_water_baseline numeric,
  p_electricity_baseline numeric,
  p_reason_code text,
  p_reason_note text default null,
  p_water_image_url text default null,
  p_electricity_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_previous_water numeric(10,2);
  v_previous_electric numeric(10,2);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_effective_billing_month <> date_trunc('month', p_effective_billing_month)::date then
    raise exception 'billing month must be the first day of a month';
  end if;

  if p_water_baseline < 0 or p_electricity_baseline < 0 then
    raise exception 'meter baseline cannot be negative';
  end if;

  if p_reason_code not in ('repair', 'meter_replaced', 'meter_fault', 'owner_usage', 'other') then
    raise exception 'invalid adjustment reason';
  end if;

  if exists (
    select 1 from public.bills
    where room_id = p_room_id and billing_month = p_effective_billing_month
  ) then
    raise exception 'cannot adjust baseline after a bill has been created';
  end if;

  select water_baseline, electricity_baseline
  into v_previous_water, v_previous_electric
  from public.meter_baseline_adjustments
  where room_id = p_room_id
    and effective_billing_month = p_effective_billing_month
    and cancelled_at is null
  order by created_at desc
  limit 1;

  if found then
    update public.meter_baseline_adjustments
    set cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancellation_note = 'แทนที่ด้วยรายการปรับฐานใหม่'
    where room_id = p_room_id
      and effective_billing_month = p_effective_billing_month
      and cancelled_at is null;
  else
    select water_curr, electricity_curr
    into v_previous_water, v_previous_electric
    from public.meter_readings
    where room_id = p_room_id
      and billing_month < p_effective_billing_month
    order by billing_month desc
    limit 1;
  end if;

  v_previous_water := coalesce(v_previous_water, 0);
  v_previous_electric := coalesce(v_previous_electric, 0);

  insert into public.meter_baseline_adjustments (
    room_id,
    effective_billing_month,
    previous_water_baseline,
    previous_electric_baseline,
    water_baseline,
    electricity_baseline,
    reason_code,
    reason_note,
    water_image_url,
    electricity_image_url,
    created_by
  ) values (
    p_room_id,
    p_effective_billing_month,
    v_previous_water,
    v_previous_electric,
    p_water_baseline,
    p_electricity_baseline,
    p_reason_code,
    nullif(trim(p_reason_note), ''),
    p_water_image_url,
    p_electricity_image_url,
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_cancel_meter_baseline(
  p_adjustment_id uuid,
  p_cancellation_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adjustment public.meter_baseline_adjustments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_adjustment
  from public.meter_baseline_adjustments
  where id = p_adjustment_id and cancelled_at is null
  for update;

  if not found then
    raise exception 'active meter baseline adjustment not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.bills
    where room_id = v_adjustment.room_id
      and billing_month = v_adjustment.effective_billing_month
  ) then
    raise exception 'cannot cancel baseline after a bill has been created';
  end if;

  update public.meter_baseline_adjustments
  set cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_note = nullif(trim(p_cancellation_note), '')
  where id = p_adjustment_id;
end;
$$;

revoke all on function public.admin_set_meter_baseline(uuid, date, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.admin_set_meter_baseline(uuid, date, numeric, numeric, text, text, text, text) to authenticated;

revoke all on function public.admin_cancel_meter_baseline(uuid, text) from public, anon;
grant execute on function public.admin_cancel_meter_baseline(uuid, text) to authenticated;

commit;
