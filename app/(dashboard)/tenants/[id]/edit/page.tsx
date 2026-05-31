import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { updateTenant } from '@/app/actions/tenants'
import { TenantForm } from '../../_components/tenant-form'
import { type TenantFormState } from '@/lib/definitions'
import { DeleteTenantButton } from './_components/delete-tenant-button'

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tenant }, { data: contracts }] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', id).single(),
    supabase.from('contracts').select('status').eq('tenant_id', id).eq('status', 'active').limit(1),
  ])

  if (!tenant) notFound()

  const hasActiveContract = (contracts?.length ?? 0) > 0

  const boundAction = async (
    state: TenantFormState,
    formData: FormData
  ): Promise<TenantFormState> => {
    'use server'
    return updateTenant(id, state, formData)
  }

  return (
    <div className="p-5 md:p-8 max-w-2xl space-y-6">
      <div>
        <Link href={`/tenants/${id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> กลับ
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">แก้ไข</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">{tenant.full_name}</h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6">
        <TenantForm action={boundAction} tenant={tenant} submitLabel="บันทึกการแก้ไข" />
      </div>

      <div className="border-t border-slate-100 pt-6 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Danger Zone</p>
        <DeleteTenantButton
          tenantId={id}
          tenantName={tenant.full_name}
          hasActiveContract={hasActiveContract}
        />
      </div>
    </div>
  )
}

