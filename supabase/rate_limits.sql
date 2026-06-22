-- Rate limiting table — keyed by "action:ip"
-- Rows are reused per key; window resets when window_start is older than the limit window
create table if not exists public.rate_limits (
  key          text primary key,
  count        integer not null default 1,
  window_start timestamptz not null default now()
);

-- Service role only — no public access needed
alter table public.rate_limits enable row level security;
-- No policies: only accessible via service role (bypasses RLS)
