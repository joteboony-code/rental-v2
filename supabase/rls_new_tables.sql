-- RLS policies สำหรับตารางใหม่ (pending_slips, payment_promises, line_message_templates)
-- ใช้รูปแบบเดียวกับตารางเดิม: admin จัดการได้ทั้งหมด
-- หมายเหตุ: webhook ใช้ service client ซึ่ง bypass RLS อยู่แล้ว จึงไม่กระทบ flow LINE

alter table public.pending_slips enable row level security;
drop policy if exists "pending_slips: admin จัดการ" on public.pending_slips;
create policy "pending_slips: admin จัดการ" on public.pending_slips for all using (public.is_admin());

alter table public.payment_promises enable row level security;
drop policy if exists "payment_promises: admin จัดการ" on public.payment_promises;
create policy "payment_promises: admin จัดการ" on public.payment_promises for all using (public.is_admin());

alter table public.line_message_templates enable row level security;
drop policy if exists "templates: admin จัดการ" on public.line_message_templates;
create policy "templates: admin จัดการ" on public.line_message_templates for all using (public.is_admin());
