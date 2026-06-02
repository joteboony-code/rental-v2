-- receipt_no field + auto-generation for payments table
-- ใช้ sequence แยกตามปี พ.ศ. เพื่อให้เลขไม่ซ้ำกัน

-- 1. เพิ่ม column receipt_no ใน payments (nullable เพื่อ backward compat กับ row เก่า)
alter table public.payments
  add column if not exists receipt_no text unique;

create index if not exists idx_payments_receipt_no on public.payments(receipt_no);

-- 2. ฟังก์ชันสร้างเลขใบเสร็จ RCPT-{พ.ศ.}-{NNNN}
--    ใช้ advisory lock เพื่อกันเลขซ้ำ (atomic per year)
create or replace function public.generate_receipt_no()
returns text
language plpgsql
security definer
as $$
declare
  be_year      int;
  seq_key      bigint;
  next_seq     int;
  receipt      text;
begin
  -- ปีพ.ศ. = ปีค.ศ. + 543
  be_year := extract(year from now() at time zone 'Asia/Bangkok')::int + 543;

  -- ใช้เลขปีเป็น advisory lock key เพื่อกัน race condition
  seq_key := be_year::bigint;
  perform pg_advisory_xact_lock(seq_key);

  -- หา sequence ล่าสุดของปีนี้
  select coalesce(
    max(
      (regexp_match(receipt_no, 'RCPT-' || be_year::text || '-(\d+)'))[1]::int
    ), 0
  ) + 1
  into next_seq
  from public.payments
  where receipt_no like 'RCPT-' || be_year::text || '-%';

  receipt := 'RCPT-' || be_year::text || '-' || lpad(next_seq::text, 4, '0');
  return receipt;
end;
$$;

-- 3. trigger: ใส่เลขใบเสร็จก่อน insert (ถ้ายังไม่มี)
create or replace function public.set_receipt_no()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_no is null or new.receipt_no = '' then
    new.receipt_no := public.generate_receipt_no();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_receipt_no on public.payments;
create trigger trg_set_receipt_no
  before insert on public.payments
  for each row execute function public.set_receipt_no();
