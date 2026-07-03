-- Allow each active contract to use a dedicated LINE recipient while keeping
-- the legal tenant, bills, meters, and payments unchanged.
alter table public.contracts
  add column if not exists line_recipient_user_id text,
  add column if not exists line_recipient_display_name text,
  add column if not exists line_recipient_picture_url text;

create index if not exists idx_contracts_line_recipient_user_id
  on public.contracts (line_recipient_user_id)
  where line_recipient_user_id is not null;

-- Pair the verified LINE identity with the active contract for a room.
-- If the tenant has never paired LINE before, keep populating tenants as the
-- default/fallback recipient for backwards compatibility.
create or replace function public.pair_tenant_line(
  p_room_number    text,
  p_line_user_id   text,
  p_display_name   text default null,
  p_picture_url    text default null
)
returns table (
  success     boolean,
  message     text,
  tenant_name text,
  room_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_id uuid;
  v_tenant_id uuid;
  v_tenant_name text;
  v_room_number text;
  v_tenant_line_user_id text;
  v_contract_line_user_id text;
begin
  if nullif(trim(p_room_number), '') is null
     or nullif(trim(p_line_user_id), '') is null then
    return query select false, 'กรุณาระบุเลขห้องและ LINE User ID', null::text, null::text;
    return;
  end if;

  select c.id, t.id, t.full_name, r.room_number,
         t.line_user_id, c.line_recipient_user_id
    into v_contract_id, v_tenant_id, v_tenant_name, v_room_number,
         v_tenant_line_user_id, v_contract_line_user_id
  from public.contracts c
  join public.tenants t on t.id = c.tenant_id
  join public.rooms r on r.id = c.room_id
  where c.status = 'active'
    and r.room_number = trim(p_room_number)
  order by c.start_date desc
  limit 1;

  if v_contract_id is null then
    return query select false, 'ไม่พบห้องที่ระบุหรือยังไม่มีสัญญาเช่า', null::text, null::text;
    return;
  end if;

  if v_contract_line_user_id is not null then
    return query select false, 'ห้องนี้มีผู้รับบิล LINE แยกแล้ว กรุณายกเลิกการจับคู่เดิมก่อน', null::text, null::text;
    return;
  end if;

  update public.contracts
     set line_recipient_user_id = trim(p_line_user_id),
         line_recipient_display_name = p_display_name,
         line_recipient_picture_url = p_picture_url
   where id = v_contract_id;

  if v_tenant_line_user_id is null then
    update public.tenants
       set line_user_id = trim(p_line_user_id),
           line_display_name = p_display_name,
           line_picture_url = p_picture_url
     where id = v_tenant_id;
  end if;

  return query
    select true, 'เชื่อม LINE เป็นผู้รับบิลของห้องสำเร็จ', v_tenant_name, v_room_number;
end;
$$;

revoke all on function public.pair_tenant_line(text, text, text, text) from public, anon, authenticated;
grant execute on function public.pair_tenant_line(text, text, text, text) to service_role;

-- Portal access follows the effective recipient:
--   dedicated contract recipient > tenant default recipient.
create or replace function public.get_tenant_portal_by_line_user(
  p_line_user_id text,
  p_room_id      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   public.tenants%rowtype;
  v_contract public.contracts%rowtype;
  v_room     public.rooms%rowtype;
  v_bills    jsonb;
begin
  if nullif(trim(p_line_user_id), '') is null then
    return null;
  end if;

  select c.* into v_contract
  from public.contracts c
  join public.tenants t on t.id = c.tenant_id
  where c.status = 'active'
    and (p_room_id is null or c.room_id = p_room_id::uuid)
    and (
      c.line_recipient_user_id = trim(p_line_user_id)
      or (
        c.line_recipient_user_id is null
        and t.line_user_id = trim(p_line_user_id)
      )
    )
  order by c.start_date desc
  limit 1;

  if v_contract.id is null then return null; end if;

  select * into v_tenant from public.tenants where id = v_contract.tenant_id;
  select * into v_room from public.rooms where id = v_contract.room_id;

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
      'wifi_amount', b.wifi_amount,
      'trash_amount', b.trash_amount,
      'other_amount', b.other_amount,
      'other_note', b.other_note,
      'total_amount', b.total_amount,
      'paid_amount', coalesce(paid.total_paid, 0),
      'remaining_amount', greatest(b.total_amount - coalesce(paid.total_paid, 0), 0),
      'meter', case when mr.id is null then null else jsonb_build_object(
        'water_prev', mr.water_prev, 'water_curr', mr.water_curr, 'water_units', mr.water_units,
        'electricity_prev', mr.electricity_prev, 'electricity_curr', mr.electricity_curr,
        'electricity_units', mr.electricity_units,
        'water_image_url', mr.water_image_url, 'electricity_image_url', mr.electricity_image_url
      ) end,
      'payments', coalesce(payments.items, '[]'::jsonb)
    ) as bill_row
    from public.bills b
    left join public.meter_readings mr on mr.id = b.meter_reading_id
    left join lateral (
      select coalesce(sum(p.amount), 0) as total_paid
      from public.payments p where p.bill_id = b.id
    ) paid on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'payment_method', p.payment_method,
        'slip_url', p.slip_url, 'paid_at', p.paid_at
      ) order by p.paid_at desc), '[]'::jsonb) as items
      from public.payments p where p.bill_id = b.id
    ) payments on true
    where b.contract_id = v_contract.id
    order by b.billing_month desc
    limit 24
  ) rows;

  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', v_tenant.id, 'full_name', v_tenant.full_name, 'phone', v_tenant.phone
    ),
    'room', jsonb_build_object(
      'id', v_room.id, 'room_number', v_room.room_number, 'floor', v_room.floor
    ),
    'contract', jsonb_build_object(
      'id', v_contract.id, 'start_date', v_contract.start_date,
      'end_date', v_contract.end_date, 'monthly_rent', v_contract.monthly_rent,
      'deposit_paid', v_contract.deposit_paid
    ),
    'bills', v_bills
  );
end;
$$;

revoke all on function public.get_tenant_portal_by_line_user(text, text) from public, anon, authenticated;
grant execute on function public.get_tenant_portal_by_line_user(text, text) to service_role;
