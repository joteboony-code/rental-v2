-- tenant_documents: เอกสารแนบของผู้เช่า (บัตรประชาชน, สัญญา, รูปห้องก่อนเข้า, หลักฐานเงินประกัน ฯลฯ)
create table if not exists public.tenant_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  contract_id   uuid references public.contracts(id) on delete set null,
  document_type text not null default 'other',   -- id_card | contract | room_before | deposit_proof | other
  file_url      text not null,
  file_name     text,
  uploaded_by   uuid,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tenant_documents_tenant_id   on public.tenant_documents(tenant_id);
create index if not exists idx_tenant_documents_room_id     on public.tenant_documents(room_id);
create index if not exists idx_tenant_documents_contract_id on public.tenant_documents(contract_id);
create index if not exists idx_tenant_documents_type        on public.tenant_documents(document_type);

-- RLS: admin จัดการได้ทั้งหมด (รูปแบบเดียวกับตารางอื่น)
alter table public.tenant_documents enable row level security;
drop policy if exists "tenant_documents: admin จัดการ" on public.tenant_documents;
create policy "tenant_documents: admin จัดการ" on public.tenant_documents for all using (public.is_admin());

-- Storage bucket สำหรับเก็บไฟล์เอกสาร (รองรับรูปภาพและ PDF)
insert into storage.buckets (id, name, public)
values ('tenant-documents', 'tenant-documents', true)
on conflict (id) do nothing;
