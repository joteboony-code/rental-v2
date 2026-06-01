-- tenant_credits: เงินรับล่วงหน้า/เครดิตของผู้เช่า (กรณีรับเงินแต่ยังไม่มีบิลให้ตัด)
create table if not exists tenant_credits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  room_id     uuid references rooms(id) on delete set null,
  amount      numeric not null,
  slip_url    text,
  slip_ref    text,
  note        text,
  status      text not null default 'available',   -- available | applied | refunded
  created_at  timestamptz not null default now(),
  created_by  uuid,
  applied_at  timestamptz
);

create index if not exists idx_tenant_credits_tenant_id on tenant_credits(tenant_id);
create index if not exists idx_tenant_credits_status    on tenant_credits(status);

-- RLS
alter table public.tenant_credits enable row level security;
drop policy if exists "tenant_credits: admin จัดการ" on public.tenant_credits;
create policy "tenant_credits: admin จัดการ" on public.tenant_credits for all using (public.is_admin());
