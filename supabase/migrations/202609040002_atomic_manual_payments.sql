begin;

create or replace function public.admin_record_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_slip_url text,
  p_note text,
  p_paid_at timestamptz,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_total_paid numeric := 0;
  v_payment_id uuid;
  v_bill_paid boolean := false;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'invalid payment amount' using errcode = '22023';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'payment amount has more than two decimal places' using errcode = '22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'promptpay') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;

  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where bill_id = p_bill_id;

  v_remaining := greatest(0, v_bill.total_amount - v_paid);
  if v_remaining <= 0 then
    raise exception 'bill already paid' using errcode = '22023';
  end if;
  if p_amount > v_remaining then
    raise exception 'amount exceeds remaining balance' using errcode = '22023';
  end if;

  -- Preserve the existing double-submit guard, but perform it while the bill is
  -- locked so two concurrent requests cannot both pass the check.
  if exists (
    select 1 from public.payments
    where bill_id = p_bill_id
      and amount = p_amount
      and created_at >= now() - interval '60 seconds'
  ) then
    raise exception 'possible duplicate payment' using errcode = '23505';
  end if;

  insert into public.payments(
    bill_id, amount, payment_method, slip_url, note, paid_at, recorded_by
  ) values (
    p_bill_id, p_amount, p_payment_method, p_slip_url, p_note,
    coalesce(p_paid_at, now()), p_recorded_by
  ) returning id into v_payment_id;

  v_total_paid := v_paid + p_amount;
  v_bill_paid := v_total_paid >= v_bill.total_amount;
  update public.bills
  set status = case
    when v_bill_paid then 'paid'
    when due_date < (timezone('Asia/Bangkok', now()))::date then 'overdue'
    else 'pending'
  end
  where id = p_bill_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'tenant_id', v_bill.tenant_id,
    'room_id', v_bill.room_id,
    'total_paid', v_total_paid,
    'total_amount', v_bill.total_amount,
    'bill_paid', v_bill_paid
  );
end;
$$;

revoke all on function public.admin_record_payment(uuid, numeric, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_record_payment(uuid, numeric, text, text, text, timestamptz, uuid)
  to service_role;

create or replace function public.admin_delete_payment(
  p_payment_id uuid,
  p_bill_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_payment public.payments%rowtype;
  v_total_paid numeric := 0;
  v_slip_in_use boolean := false;
begin
  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id and bill_id = p_bill_id
  for update;
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;

  delete from public.payments where id = p_payment_id;

  select coalesce(sum(amount), 0) into v_total_paid
  from public.payments
  where bill_id = p_bill_id;

  update public.bills
  set status = case
    when v_total_paid >= total_amount then 'paid'
    when due_date < (timezone('Asia/Bangkok', now()))::date then 'overdue'
    else 'pending'
  end
  where id = p_bill_id;

  if v_payment.slip_url is not null then
    select exists(
      select 1 from public.payments where slip_url = v_payment.slip_url
      union all select 1 from public.pending_slips where slip_url = v_payment.slip_url
      union all select 1 from public.tenant_credits where slip_url = v_payment.slip_url
    ) into v_slip_in_use;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'amount', v_payment.amount,
    'payment_method', v_payment.payment_method,
    'slip_url', v_payment.slip_url,
    'slip_ref', v_payment.slip_ref,
    'note', v_payment.note,
    'paid_at', v_payment.paid_at,
    'tenant_id', v_bill.tenant_id,
    'room_id', v_bill.room_id,
    'total_paid', v_total_paid,
    'total_amount', v_bill.total_amount,
    'slip_in_use', v_slip_in_use
  );
end;
$$;

revoke all on function public.admin_delete_payment(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_payment(uuid, uuid)
  to service_role;

create or replace function public.admin_mark_bill_paid(
  p_bill_id uuid,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_paid numeric := 0;
  v_remaining numeric := 0;
  v_payment_id uuid := null;
begin
  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where bill_id = p_bill_id;
  v_remaining := greatest(0, v_bill.total_amount - v_paid);

  if v_remaining > 0 then
    insert into public.payments(
      bill_id, amount, payment_method, note, paid_at, recorded_by
    ) values (
      p_bill_id, v_remaining, 'cash', 'รับเงินสด (บันทึกโดยเจ้าของ)', now(), p_recorded_by
    ) returning id into v_payment_id;
  end if;

  update public.bills set status = 'paid' where id = p_bill_id;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'amount', v_remaining,
    'tenant_id', v_bill.tenant_id,
    'room_id', v_bill.room_id,
    'total_paid', v_paid + v_remaining,
    'total_amount', v_bill.total_amount
  );
end;
$$;

revoke all on function public.admin_mark_bill_paid(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_mark_bill_paid(uuid, uuid)
  to service_role;

commit;
