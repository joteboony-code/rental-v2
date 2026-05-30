-- Tenant portal dashboard via paired LINE user ID.
-- Run this in Supabase SQL Editor before using /portal in production.

alter table public.meter_readings
  add column if not exists water_image_url text,
  add column if not exists electricity_image_url text;

create or replace function public.get_tenant_portal_by_line_user(
  p_line_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_contract public.contracts%rowtype;
  v_room public.rooms%rowtype;
  v_bills jsonb;
begin
  if nullif(trim(p_line_user_id), '') is null then
    return null;
  end if;

  select *
    into v_tenant
  from public.tenants
  where line_user_id = trim(p_line_user_id)
  limit 1;

  if v_tenant.id is null then
    return null;
  end if;

  select *
    into v_contract
  from public.contracts
  where tenant_id = v_tenant.id
    and status = 'active'
  order by start_date desc
  limit 1;

  if v_contract.id is null then
    return jsonb_build_object(
      'tenant', jsonb_build_object(
        'id', v_tenant.id,
        'full_name', v_tenant.full_name,
        'phone', v_tenant.phone
      ),
      'room', null,
      'contract', null,
      'bills', '[]'::jsonb
    );
  end if;

  select *
    into v_room
  from public.rooms
  where id = v_contract.room_id;

  select coalesce(jsonb_agg(bill_row order by (bill_row->>'billing_month') desc), '[]'::jsonb)
    into v_bills
  from (
    select jsonb_build_object(
      'id', b.id,
      'billing_month', b.billing_month,
      'due_date', b.due_date,
      'status', b.status,
      'rent_amount', b.rent_amount,
      'water_amount', b.water_amount,
      'electricity_amount', b.electricity_amount,
      'other_amount', b.other_amount,
      'other_note', b.other_note,
      'total_amount', b.total_amount,
      'paid_amount', coalesce(paid.total_paid, 0),
      'remaining_amount', greatest(b.total_amount - coalesce(paid.total_paid, 0), 0),
      'meter', case when mr.id is null then null else jsonb_build_object(
        'water_prev', mr.water_prev,
        'water_curr', mr.water_curr,
        'water_units', mr.water_units,
        'electricity_prev', mr.electricity_prev,
        'electricity_curr', mr.electricity_curr,
        'electricity_units', mr.electricity_units,
        'water_image_url', mr.water_image_url,
        'electricity_image_url', mr.electricity_image_url
      ) end,
      'payments', coalesce(payments.items, '[]'::jsonb)
    ) as bill_row
    from public.bills b
    left join public.meter_readings mr on mr.id = b.meter_reading_id
    left join lateral (
      select coalesce(sum(p.amount), 0) as total_paid
      from public.payments p
      where p.bill_id = b.id
    ) paid on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'amount', p.amount,
        'payment_method', p.payment_method,
        'slip_url', p.slip_url,
        'paid_at', p.paid_at
      ) order by p.paid_at desc), '[]'::jsonb) as items
      from public.payments p
      where p.bill_id = b.id
    ) payments on true
    where b.tenant_id = v_tenant.id
    order by b.billing_month desc
    limit 24
  ) rows;

  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', v_tenant.id,
      'full_name', v_tenant.full_name,
      'phone', v_tenant.phone
    ),
    'room', jsonb_build_object(
      'id', v_room.id,
      'room_number', v_room.room_number,
      'floor', v_room.floor
    ),
    'contract', jsonb_build_object(
      'id', v_contract.id,
      'start_date', v_contract.start_date,
      'end_date', v_contract.end_date,
      'monthly_rent', v_contract.monthly_rent,
      'deposit_paid', v_contract.deposit_paid
    ),
    'bills', v_bills
  );
end;
$$;

grant execute on function public.get_tenant_portal_by_line_user(text) to authenticated, anon;
