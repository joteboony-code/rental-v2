begin;
create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_date date not null,
  recipient_key text not null,
  rooms text[] not null default '{}',
  bill_ids uuid[] not null default '{}',
  amount numeric(14,2) not null default 0,
  status text not null check (status in ('sending','accepted','failed','unknown','skipped')),
  reason text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reminder_date, recipient_key)
);
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from public, anon, authenticated;
grant select on public.reminder_deliveries to authenticated;
grant all on public.reminder_deliveries to service_role;
drop policy if exists reminder_deliveries_admin_read on public.reminder_deliveries;
create policy reminder_deliveries_admin_read on public.reminder_deliveries
  for select to authenticated using (public.is_admin());
-- Enable the owner summary explicitly requested for scheduled reminders.
update public.line_integrations set bill_reminder_notify_enabled = true;
update public.settings set notify_reminder_summary_enabled = true where id = 1;
commit;
