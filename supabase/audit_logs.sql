-- audit_logs: ประวัติการกระทำสำคัญในระบบ (แก้/ลบบิล, payment, อนุมัติ/ปฏิเสธสลิป, ย้ายออก, คืนเงินประกัน ฯลฯ)
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,                 -- เช่น bill_update, bill_delete, payment_create, slip_approve ...
  entity_type text,                           -- เช่น bill, payment, pending_slip, tenant, contract, line_mapping
  entity_id   text,
  tenant_id   uuid references public.tenants(id) on delete set null,
  room_id     uuid references public.rooms(id) on delete set null,
  old_value   jsonb,
  new_value   jsonb,
  description text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at  on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action      on public.audit_logs(action);
create index if not exists idx_audit_logs_entity_type on public.audit_logs(entity_type);
create index if not exists idx_audit_logs_tenant_id   on public.audit_logs(tenant_id);
create index if not exists idx_audit_logs_room_id     on public.audit_logs(room_id);

-- RLS: admin อ่าน/จัดการได้ทั้งหมด (insert มาจากฝั่ง server ที่ผ่าน auth แล้ว)
alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs: admin จัดการ" on public.audit_logs;
create policy "audit_logs: admin จัดการ" on public.audit_logs for all using (public.is_admin());
