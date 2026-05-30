-- Tenant LINE pairing without exposing tenants to public RLS reads.

-- Drop old 3-param version
drop function if exists public.pair_tenant_line(text, text, text);

create or replace function public.pair_tenant_line(
  p_room_number text,
  p_line_user_id text
)
returns table (
  success boolean,
  message text,
  tenant_name text,
  room_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_tenant_name text;
  v_room_number text;
begin
  if nullif(trim(p_room_number), '') is null
     or nullif(trim(p_line_user_id), '') is null then
    return query select false, 'กรุณาระบุเลขห้องและ LINE User ID', null::text, null::text;
    return;
  end if;

  select t.id, t.full_name, r.room_number
    into v_tenant_id, v_tenant_name, v_room_number
  from public.contracts c
  join public.tenants t on t.id = c.tenant_id
  join public.rooms r on r.id = c.room_id
  where c.status = 'active'
    and r.room_number = trim(p_room_number)
  limit 1;

  if v_tenant_id is null then
    return query select false, 'ไม่พบห้องที่ระบุหรือยังไม่มีสัญญาเช่า', null::text, null::text;
    return;
  end if;

  update public.tenants
     set line_user_id = trim(p_line_user_id)
   where id = v_tenant_id;

  return query select true, 'เชื่อม LINE กับห้องสำเร็จ', v_tenant_name, v_room_number;
end;
$$;

grant execute on function public.pair_tenant_line(text, text) to authenticated, anon;
