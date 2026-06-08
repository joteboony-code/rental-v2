create table if not exists public.page_views (
  id        bigint generated always as identity primary key,
  page      text not null,
  viewed_at timestamptz not null default now()
);

-- public สามารถ insert ได้ (no auth)
alter table public.page_views enable row level security;

create policy "public can log view"
  on public.page_views for insert
  with check (true);

create policy "auth users can read views"
  on public.page_views for select
  to authenticated
  using (true);

create index if not exists idx_page_views_page_viewed_at
  on public.page_views(page, viewed_at desc);
