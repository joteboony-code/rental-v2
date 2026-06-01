-- Room reservation details for rooms with status = 'reserved'.
alter table public.rooms
  add column if not exists reserved_name text,
  add column if not exists reserved_phone text,
  add column if not exists reserved_deposit numeric(12,2),
  add column if not exists reservation_expires date,
  add column if not exists reservation_note text;

create index if not exists idx_rooms_reservation_expires
  on public.rooms(reservation_expires)
  where status = 'reserved';
