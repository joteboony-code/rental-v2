-- payment_promises: บันทึก "สัญญาว่าจะจ่ายวันที่..."
create table if not exists payment_promises (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  room_id      uuid references rooms(id) on delete set null,
  bill_id      uuid references bills(id) on delete set null,
  promise_date date not null,
  amount       numeric,
  note         text,
  status       text not null default 'active',   -- active | paid | missed | cancelled
  created_at   timestamptz not null default now(),
  created_by   uuid,
  resolved_at  timestamptz
);

create index if not exists idx_payment_promises_status       on payment_promises(status);
create index if not exists idx_payment_promises_tenant_id    on payment_promises(tenant_id);
create index if not exists idx_payment_promises_promise_date on payment_promises(promise_date);
create index if not exists idx_payment_promises_bill_id      on payment_promises(bill_id);
