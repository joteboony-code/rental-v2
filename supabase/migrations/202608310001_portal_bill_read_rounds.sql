begin;

-- A billing month starts at most one read round, after the bulk LINE send
-- succeeds for all eligible recipients. Never erase tenants' access history.
create table public.portal_bill_rounds (
  billing_month date primary key check (extract(day from billing_month) = 1),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.portal_bill_deliveries (
  billing_month date not null references public.portal_bill_rounds(billing_month) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  line_user_id text not null,
  first_sent_started_at timestamptz,
  sent_at timestamptz,
  last_open_at timestamptz,
  primary key (billing_month, bill_id),
  check ((first_sent_started_at is null) = (sent_at is null))
);
create index portal_bill_deliveries_recipient_idx
  on public.portal_bill_deliveries (line_user_id, room_id);

alter table public.portal_bill_rounds enable row level security;
alter table public.portal_bill_deliveries enable row level security;
revoke all on public.portal_bill_rounds, public.portal_bill_deliveries from anon, authenticated;
grant select on public.portal_bill_rounds, public.portal_bill_deliveries to authenticated;
grant all on public.portal_bill_rounds, public.portal_bill_deliveries to service_role;
create policy "portal bill rounds: admin read" on public.portal_bill_rounds
  for select to authenticated using (public.is_admin());
create policy "portal bill deliveries: admin read" on public.portal_bill_deliveries
  for select to authenticated using (public.is_admin());

create function public.admin_prepare_portal_bill_round(p_billing_month date, p_create boolean default true)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_completed_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_billing_month is null or extract(day from p_billing_month) <> 1 then
    raise exception 'invalid billing month';
  end if;
  if p_create then
    insert into public.portal_bill_rounds (billing_month) values (p_billing_month)
      on conflict do nothing;
  end if;
  select completed_at into v_completed_at from public.portal_bill_rounds
    where billing_month = p_billing_month for update;
  if not found then
    raise exception 'start the full bulk send before retrying';
  end if;

  -- Retry snapshots still include the whole month, not only failed room IDs.
  -- Remove unsent targets that are no longer payable/reachable. Sent history stays.
  delete from public.portal_bill_deliveries d
  where d.billing_month = p_billing_month and d.sent_at is null
    and not exists (
      select 1 from public.bills b
      join public.tenants t on t.id = b.tenant_id
      join public.contracts c on c.id = b.contract_id
      where b.id = d.bill_id and b.status in ('pending', 'overdue')
        and b.total_amount > coalesce((select sum(p.amount) from public.payments p where p.bill_id = b.id), 0)
        and nullif(coalesce(c.line_recipient_user_id, t.line_user_id), '') = d.line_user_id
    );

  insert into public.portal_bill_deliveries (billing_month, bill_id, tenant_id, room_id, line_user_id)
  select b.billing_month, b.id, b.tenant_id, b.room_id, coalesce(c.line_recipient_user_id, t.line_user_id)
  from public.bills b
  join public.tenants t on t.id = b.tenant_id
  join public.contracts c on c.id = b.contract_id
  where b.billing_month = p_billing_month and b.status in ('pending', 'overdue')
    and b.total_amount > coalesce((select sum(p.amount) from public.payments p where p.bill_id = b.id), 0)
    and nullif(coalesce(c.line_recipient_user_id, t.line_user_id), '') is not null
  on conflict do nothing;

  return exists (select 1 from public.portal_bill_deliveries where billing_month = p_billing_month);
end;
$$;

create function public.admin_finish_portal_bill_round(p_billing_month date, p_deliveries jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_completed_at timestamptz;
  v_pending integer;
  v_total integer;
  v_activated boolean := false;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select completed_at into v_completed_at from public.portal_bill_rounds
    where billing_month = p_billing_month for update;
  if not found then raise exception 'round not prepared'; end if;

  -- The earliest SUCCESSFUL attempt wins. A resend never advances the cutoff.
  -- Portal opens during the LINE request remain valid when the batch completes.
  update public.portal_bill_deliveries d
  set first_sent_started_at = least(d.first_sent_started_at, s.started_at),
      sent_at = coalesce(d.sent_at, now())
  from jsonb_to_recordset(p_deliveries) as s(bill_id uuid, line_user_id text, started_at timestamptz)
  where d.billing_month = p_billing_month and d.bill_id = s.bill_id
    and d.line_user_id = s.line_user_id and s.started_at is not null;

  select count(*), count(*) filter (where sent_at is null) into v_total, v_pending
  from public.portal_bill_deliveries where billing_month = p_billing_month;
  if v_completed_at is null and v_total > 0 and v_pending = 0 then
    update public.portal_bill_rounds set completed_at = now() where billing_month = p_billing_month;
    v_completed_at := now();
    v_activated := true;
  end if;
  return jsonb_build_object('completed', v_completed_at is not null, 'activated', v_activated, 'pending', v_pending);
end;
$$;

-- Only the server may record a verified tenant's successfully loaded room.
-- Admin previews use a separate action and must never call this function.
create function public.record_portal_bill_open(p_line_user_id text, p_tenant_id uuid, p_room_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.tenants set last_portal_open_at = greatest(last_portal_open_at, now()) where id = p_tenant_id;
  update public.portal_bill_deliveries set last_open_at = greatest(last_open_at, now())
  where line_user_id = p_line_user_id and tenant_id = p_tenant_id and room_id = p_room_id
    and billing_month >= coalesce(
      (select max(billing_month) from public.portal_bill_rounds where completed_at is not null),
      billing_month
    );
end;
$$;

revoke all on function public.admin_prepare_portal_bill_round(date, boolean) from public, anon, authenticated;
revoke all on function public.admin_finish_portal_bill_round(date, jsonb) from public, anon, authenticated;
revoke all on function public.record_portal_bill_open(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_prepare_portal_bill_round(date, boolean) to authenticated;
grant execute on function public.admin_finish_portal_bill_round(date, jsonb) to authenticated;
grant execute on function public.record_portal_bill_open(text, uuid, uuid) to service_role;

commit;
