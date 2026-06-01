-- pending_slips: เก็บสลิปที่ auto-match ไม่ได้ รอเจ้าของหอตรวจสอบ
create table if not exists pending_slips (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete set null,
  room_id       uuid references rooms(id) on delete set null,
  line_user_id  text,
  source        text not null default 'line',
  slip_url      text,
  amount        numeric,
  paid_at       timestamptz,
  slip_ref      text,
  sender_name   text,
  slipok_status text not null default 'unknown',
  slipok_code   integer,
  slipok_message text,
  match_candidates jsonb,
  status        text not null default 'pending',   -- pending | approved | rejected
  admin_note    text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid
);

create index if not exists idx_pending_slips_status     on pending_slips(status);
create index if not exists idx_pending_slips_tenant_id  on pending_slips(tenant_id);
create index if not exists idx_pending_slips_created_at on pending_slips(created_at desc);
