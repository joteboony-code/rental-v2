begin;

-- One bank reference cannot be processed concurrently via LINE and the dashboard.
create or replace function public.lock_payment_slip_ref(p_ref text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if nullif(trim(p_ref),'') is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ref,0));
  if exists(select 1 from payments where slip_ref=p_ref)
     or exists(select 1 from tenant_credits where slip_ref=p_ref) then
    raise exception 'slip already recorded' using errcode='23505';
  end if;
end;
$$;
revoke all on function public.lock_payment_slip_ref(text) from public,anon,authenticated;
grant execute on function public.lock_payment_slip_ref(text) to service_role;

create or replace function public.apply_multi_bill_payment(
  p_bills jsonb,p_method text,p_slip_url text,p_slip_ref text,p_note text,p_paid_at timestamptz,p_group_id uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb; v_bill bills%rowtype; v_paid numeric; v_amount numeric; v_id uuid;
  v_first boolean:=true; v_results jsonb:='[]'::jsonb;
begin
  if p_bills is null or jsonb_typeof(p_bills)<>'array' then
    raise exception 'invalid bills' using errcode='22023';
  end if;
  if jsonb_array_length(p_bills)=0 or jsonb_array_length(p_bills)>100 or p_group_id is null
    or p_method is null or p_method not in ('cash','transfer','promptpay','qr','other') then
    raise exception 'invalid payment input' using errcode='22023';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_bills))<>jsonb_array_length(p_bills) then
    raise exception 'duplicate bill in payment' using errcode='22023';
  end if;
  perform lock_payment_slip_ref(p_slip_ref);
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text,1));
  if exists(select 1 from payments where payment_group_id=p_group_id) then
    raise exception 'payment group already recorded' using errcode='23505';
  end if;
  -- Stable bill-lock order, shared with every dashboard payment RPC.
  perform id from bills where id in (select (value->>'id')::uuid from jsonb_array_elements(p_bills)) order by id for update;
  for v_item in select value from jsonb_array_elements(p_bills) loop
    v_amount:=(v_item->>'amount')::numeric;
    if v_amount is null or v_amount<=0 or v_amount>1000000 or round(v_amount,2)<>v_amount then
      raise exception 'invalid payment amount' using errcode='22023';
    end if;
    select * into v_bill from bills where id=(v_item->>'id')::uuid;
    if not found then raise exception 'bill not found' using errcode='P0002'; end if;
    select coalesce(sum(amount),0) into v_paid from payments where bill_id=v_bill.id;
    if v_amount>greatest(0,v_bill.total_amount-v_paid) then
      raise exception 'amount exceeds remaining balance' using errcode='22023';
    end if;
    insert into payments(bill_id,amount,payment_method,slip_url,slip_ref,note,paid_at,payment_group_id)
    values(v_bill.id,v_amount,p_method,p_slip_url,case when v_first then p_slip_ref end,p_note,coalesce(p_paid_at,now()),p_group_id)
    returning id into v_id;
    v_first:=false;
    update bills set status=case when v_paid+v_amount>=total_amount then 'paid'
      when due_date<timezone('Asia/Bangkok',now())::date then 'overdue' else 'pending' end where id=v_bill.id;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('payment_id',v_id,'bill_id',v_bill.id,
      'room_id',v_bill.room_id,'amount',v_amount,'total_paid',v_paid+v_amount,'total_amount',v_bill.total_amount));
  end loop;
  return v_results;
end;
$$;
revoke all on function public.apply_multi_bill_payment(jsonb,text,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.apply_multi_bill_payment(jsonb,text,text,text,text,timestamptz,uuid) to service_role;

create or replace function public.apply_multi_bill_payment_with_credit(
  p_bills jsonb,p_method text,p_slip_url text,p_slip_ref text,p_note text,p_paid_at timestamptz,p_group_id uuid,
  p_credit_amount numeric,p_credit_tenant_id uuid,p_credit_room_id uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb;
begin
  if p_credit_amount is null or p_credit_amount<0 or p_credit_amount>1000000 or round(p_credit_amount,2)<>p_credit_amount then
    raise exception 'invalid credit amount' using errcode='22023';
  end if;
  v_result:=apply_multi_bill_payment(p_bills,p_method,p_slip_url,p_slip_ref,p_note,p_paid_at,p_group_id);
  if p_credit_amount>0 then
    if p_credit_tenant_id is null then raise exception 'credit tenant required' using errcode='22023'; end if;
    insert into tenant_credits(tenant_id,room_id,amount,slip_url,slip_ref,note,status)
    values(p_credit_tenant_id,p_credit_room_id,p_credit_amount,p_slip_url,p_slip_ref,p_note,'available');
  end if;
  return v_result;
end;
$$;
revoke all on function public.apply_multi_bill_payment_with_credit(jsonb,text,text,text,text,timestamptz,uuid,numeric,uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_multi_bill_payment_with_credit(jsonb,text,text,text,text,timestamptz,uuid,numeric,uuid,uuid) to service_role;

create or replace function public.admin_approve_pending_slip(
  p_slip_id uuid,p_bill_id uuid,p_amount numeric,p_payment_method text,p_paid_at timestamptz,p_note text,p_reviewed_by uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_slip pending_slips%rowtype; v_result jsonb; v_group uuid:=gen_random_uuid(); v_tenant uuid;
begin
  select * into v_slip from pending_slips where id=p_slip_id and status='pending' for update;
  if not found then raise exception 'slip unavailable' using errcode='P0002'; end if;
  v_result:=apply_multi_bill_payment(jsonb_build_array(jsonb_build_object('id',p_bill_id,'amount',p_amount)),
    p_payment_method,v_slip.slip_url,v_slip.slip_ref,p_note,p_paid_at,v_group);
  update payments set recorded_by=p_reviewed_by where payment_group_id=v_group;
  update pending_slips set status='approved',reviewed_at=now(),reviewed_by=p_reviewed_by,admin_note=p_note where id=p_slip_id;
  select tenant_id into v_tenant from bills where id=p_bill_id;
  return (v_result->0)||jsonb_build_object('tenant_id',v_tenant,'slip_ref',v_slip.slip_ref);
end;
$$;
revoke all on function public.admin_approve_pending_slip(uuid,uuid,numeric,text,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_approve_pending_slip(uuid,uuid,numeric,text,timestamptz,text,uuid) to service_role;

create or replace function public.admin_approve_slip_oldest_first(
  p_slip_id uuid,p_tenant_id uuid,p_line_user_id text,p_amount numeric,p_paid_at timestamptz,p_payment_method text,p_note text,p_reviewed_by uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_slip pending_slips%rowtype; v_contracts uuid[]; v_bill bills%rowtype; v_left numeric:=p_amount;
  v_paid numeric; v_part numeric; v_input jsonb:='[]'::jsonb; v_result jsonb; v_group uuid:=gen_random_uuid();
begin
  if p_amount is null or p_amount<=0 or p_amount>1000000 or round(p_amount,2)<>p_amount then
    raise exception 'invalid amount' using errcode='22023';
  end if;
  select * into v_slip from pending_slips where id=p_slip_id and status='pending' for update;
  if not found then raise exception 'slip unavailable' using errcode='P0002'; end if;
  perform lock_payment_slip_ref(v_slip.slip_ref);
  select array_agg(c.id) into v_contracts from contracts c join tenants t on t.id=c.tenant_id
  where c.status='active' and p_line_user_id is not null and
    (c.line_recipient_user_id=p_line_user_id or (c.line_recipient_user_id is null and t.line_user_id=p_line_user_id));
  if coalesce(cardinality(v_contracts),0)=0 then
    select array_agg(id) into v_contracts from contracts where status='active' and tenant_id=p_tenant_id;
  end if;
  perform id from bills where contract_id=any(v_contracts) order by id for update;
  for v_bill in select * from bills where contract_id=any(v_contracts) order by due_date asc nulls last,billing_month,id loop
    exit when v_left<=0;
    select coalesce(sum(amount),0) into v_paid from payments where bill_id=v_bill.id;
    v_part:=least(v_left,greatest(0,v_bill.total_amount-v_paid));
    if v_part>0 then
      v_input:=v_input||jsonb_build_array(jsonb_build_object('id',v_bill.id,'amount',v_part));
      v_left:=v_left-v_part;
    end if;
  end loop;
  if v_left>0 then raise exception 'amount exceeds remaining balance' using errcode='22023'; end if;
  v_result:=apply_multi_bill_payment(v_input,p_payment_method,v_slip.slip_url,v_slip.slip_ref,p_note,p_paid_at,v_group);
  update payments set recorded_by=p_reviewed_by where payment_group_id=v_group;
  update pending_slips set status='approved',reviewed_at=now(),reviewed_by=p_reviewed_by,admin_note=p_note where id=p_slip_id;
  return v_result;
end;
$$;
revoke all on function public.admin_approve_slip_oldest_first(uuid,uuid,text,numeric,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_approve_slip_oldest_first(uuid,uuid,text,numeric,timestamptz,text,text,uuid) to service_role;

create or replace function public.admin_save_slip_as_advance(
  p_slip_id uuid,p_tenant_id uuid,p_room_id uuid,p_amount numeric,p_note text,p_reviewed_by uuid
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_slip pending_slips%rowtype; v_id uuid;
begin
  if p_amount is null or p_amount<=0 or p_amount>1000000 or round(p_amount,2)<>p_amount or p_tenant_id is null then
    raise exception 'invalid credit input' using errcode='22023';
  end if;
  select * into v_slip from pending_slips where id=p_slip_id and status='pending' for update;
  if not found then raise exception 'slip unavailable' using errcode='P0002'; end if;
  perform lock_payment_slip_ref(v_slip.slip_ref);
  insert into tenant_credits(tenant_id,room_id,amount,slip_url,slip_ref,note,status,created_by)
  values(p_tenant_id,p_room_id,p_amount,v_slip.slip_url,v_slip.slip_ref,p_note,'available',p_reviewed_by) returning id into v_id;
  update pending_slips set status='approved',reviewed_at=now(),reviewed_by=p_reviewed_by,
    admin_note=concat('เงินรับล่วงหน้า',case when p_note is not null then ': '||p_note end) where id=p_slip_id;
  return v_id;
end;
$$;
revoke all on function public.admin_save_slip_as_advance(uuid,uuid,uuid,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_save_slip_as_advance(uuid,uuid,uuid,numeric,text,uuid) to service_role;
commit;
