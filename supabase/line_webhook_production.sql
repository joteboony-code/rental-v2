-- Production support for LINE OA webhook, room pairing, and owner notifications.

alter table public.line_integrations
  add column if not exists owner_line_user_id text;

create table if not exists public.pairing_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pairing_tokens_token on public.pairing_tokens(token);
create index if not exists idx_pairing_tokens_tenant_id on public.pairing_tokens(tenant_id);

alter table public.pairing_tokens enable row level security;

drop policy if exists "pairing_tokens: admin manage" on public.pairing_tokens;
create policy "pairing_tokens: admin manage" on public.pairing_tokens
  for all using (public.is_admin());
