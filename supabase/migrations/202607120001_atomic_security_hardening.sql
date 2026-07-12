-- Ordered, idempotent hardening migration. Apply after the existing schema.
begin;

do $$
begin
  if to_regprocedure('public.pair_tenant_line(text,text)') is not null then
    execute 'revoke all on function public.pair_tenant_line(text, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.pair_tenant_line(text,text,text,text)') is not null then
    execute 'revoke all on function public.pair_tenant_line(text, text, text, text) from public, anon, authenticated';
    execute 'grant execute on function public.pair_tenant_line(text, text, text, text) to service_role';
  end if;
  if to_regprocedure('public.get_tenant_portal_by_line_user(text)') is not null then
    execute 'revoke all on function public.get_tenant_portal_by_line_user(text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.get_tenant_portal_by_line_user(text,text)') is not null then
    execute 'revoke all on function public.get_tenant_portal_by_line_user(text, text) from public, anon, authenticated';
    execute 'grant execute on function public.get_tenant_portal_by_line_user(text, text) to service_role';
  end if;
end;
$$;

create or replace function public.admin_approve_pending_slip(
  p_slip_id uuid, p_bill_id uuid, p_amount numeric, p_payment_method text,
  p_paid_at timestamptz, p_note text, p_reviewed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slip public.pending_slips%rowtype;
  v_bill public.bills%rowtype;
  v_paid numeric := 0;
  v_payment_id uuid;
begin
  if p_amount <= 0 then raise exception 'invalid amount' using errcode = '22023'; end if;
  select * into v_slip from public.pending_slips
    where id = p_slip_id and status = 'pending' for update;
  if not found then raise exception 'slip unavailable' using errcode = 'P0002'; end if;
  select * into v_bill from public.bills where id = p_bill_id for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where bill_id = p_bill_id;
  if p_amount > greatest(0, v_bill.total_amount - v_paid) + 0.01 then
    raise exception 'amount exceeds remaining balance' using errcode = '22023';
  end if;
  update public.pending_slips set status = 'approved', reviewed_at = now(),
    reviewed_by = p_reviewed_by, admin_note = p_note where id = p_slip_id;
  insert into public.payments(
    bill_id, amount, payment_method, slip_url, slip_ref, note, paid_at, recorded_by
  ) values (
    p_bill_id, p_amount, p_payment_method, v_slip.slip_url, v_slip.slip_ref,
    p_note, p_paid_at, p_reviewed_by
  ) returning id into v_payment_id;
  update public.bills set status = case
    when v_paid + p_amount >= total_amount - 0.01 then 'paid'
    when status = 'paid' then 'pending' else status end
  where id = p_bill_id;
  return jsonb_build_object(
    'payment_id', v_payment_id, 'tenant_id', v_bill.tenant_id,
    'room_id', v_bill.room_id, 'slip_ref', v_slip.slip_ref
  );
end;
$$;
revoke all on function public.admin_approve_pending_slip(uuid, uuid, numeric, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_approve_pending_slip(uuid, uuid, numeric, text, timestamptz, text, uuid)
  to service_role;

create or replace function public.admin_convert_reservation(
  p_room_id uuid, p_start_date date, p_additional_deposit numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_tenant_id uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.status <> 'reserved' then
    raise exception 'room is not reserved' using errcode = '22023';
  end if;
  v_tenant_id := v_room.reserved_tenant_id;
  if v_tenant_id is null then
    if nullif(trim(v_room.reserved_name), '') is null then
      raise exception 'reserved name is required' using errcode = '22023';
    end if;
    insert into public.tenants(full_name, phone, note)
    values (
      trim(v_room.reserved_name), v_room.reserved_phone,
      case when v_room.reservation_note is null then 'Created from room reservation'
           else 'Created from room reservation: ' || v_room.reservation_note end
    ) returning id into v_tenant_id;
  end if;
  insert into public.contracts(
    room_id, tenant_id, start_date, monthly_rent, deposit_paid, status, note
  ) values (
    p_room_id, v_tenant_id, p_start_date, v_room.monthly_rent,
    coalesce(v_room.reserved_deposit, 0) + coalesce(p_additional_deposit, 0),
    'active', 'Created from room reservation'
  );
  update public.rooms set status = 'occupied', reserved_tenant_id = null,
    reserved_name = null, reserved_phone = null, reserved_deposit = null,
    reservation_expires = null, reservation_note = null where id = p_room_id;
  return v_tenant_id;
end;
$$;
revoke all on function public.admin_convert_reservation(uuid, date, numeric)
  from public, anon, authenticated;
grant execute on function public.admin_convert_reservation(uuid, date, numeric) to service_role;

commit;
