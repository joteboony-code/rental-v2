-- Multi-tenant-ready LINE integration storage.
-- Store only encrypted tokens in the database. The encryption key lives in
-- Cloudflare/Supabase environment variables as ENCRYPTION_KEY.

create table if not exists public.dorms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.dorms (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default dorm')
on conflict (id) do nothing;

alter table public.profiles
  add column if not exists dorm_id uuid references public.dorms(id)
  default '00000000-0000-0000-0000-000000000001';

create table if not exists public.line_integrations (
  dorm_id uuid primary key references public.dorms(id) on delete cascade,
  line_oa_basic_id text,
  line_liff_id text,
  app_url text,
  owner_line_user_id text,
  encrypted_channel_access_token text,
  encrypted_channel_secret text,
  token_last4 text,
  channel_secret_last4 text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists line_integrations_updated_at on public.line_integrations;
create trigger line_integrations_updated_at
  before update on public.line_integrations
  for each row execute procedure public.set_updated_at();

alter table public.dorms enable row level security;
alter table public.line_integrations enable row level security;

alter table public.line_integrations
  add column if not exists owner_line_user_id text;

drop policy if exists "dorms: admin manage" on public.dorms;
create policy "dorms: admin manage" on public.dorms
  for all using (public.is_admin());

drop policy if exists "line_integrations: admin manage" on public.line_integrations;
create policy "line_integrations: admin manage" on public.line_integrations
  for all using (public.is_admin());
