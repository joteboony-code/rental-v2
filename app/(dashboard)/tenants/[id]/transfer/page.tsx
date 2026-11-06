import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { ChevronLeft, ArrowLeftRight } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { TransferWizard } from './_components/transfer-wizard'

export default async function TenantTransferPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tenant }, { data: contracts }] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', id).single(),
    supabase
      .from('contracts')
      .select(`*, rooms ( room_number, floor )`)
      .eq('tenant_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!tenant) notFound()

  const activeContract = (contracts ?? []).find((c) => c.status === 'active')
  const roomNumber = activeContract?.rooms?.room_number ?? null
  const roomRowVal = roomNumber ? roomRow(roomNumber) : null

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Link
          href={`/tenants/${id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors"
        >
          <ChevronLeft className="size-3.5" /> กลับไปหน้าผู้เช่า
        </Link>

        <div className="flex items-center gap-4">
          <div className="size-14 rounded-2xl bg-violet-950 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-violet-900/20">
            <ArrowLeftRight className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">โอนเช่า</h1>
            <p className="text-sm text-slate-500 mt-1">
              {tenant.full_name}
              {roomNumber ? ` · ห้อง ${roomNumber}${roomRowVal ? ` (แถวที่ ${roomRowVal})` : ''}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Wizard: pick a case via cards, read the popup, then go to the existing flow */}
      <TransferWizard
        tenantId={id}
        contractId={activeContract?.id ?? null}
        roomNumber={roomNumber}
        hasLine={Boolean(tenant.line_user_id || activeContract?.line_recipient_user_id)}
      />

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400">
          เลือกกรณีตามสถานการณ์ แล้วอ่านคำอธิบายก่อนยืนยัน
        </p>
        <Link
          href={`/tenants/${id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' rounded-xl border-slate-200 text-slate-600'}
        >
          ยกเลิก
        </Link>
      </div>
    </div>
  )
}
