import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, LogOut } from 'lucide-react'
import { CheckoutForm } from './_components/checkout-form'
import { roomRow } from '@/lib/room-utils'

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tenant }, { data: contract }] = await Promise.all([
    supabase.from('tenants').select('id, full_name, phone, line_user_id').eq('id', id).single(),
    supabase
      .from('contracts')
      .select('id, status, deposit_paid, start_date, rooms ( id, room_number, floor, deposit )')
      .eq('tenant_id', id)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (!tenant) notFound()

  type RoomJoin = { id: string; room_number: string; floor: number | null; deposit: number }
  const room = contract?.rooms as unknown as RoomJoin | null

  // deposit_paid from contract → fallback to room.deposit (default)
  const depositPaid = Number(contract?.deposit_paid) || Number(room?.deposit) || 0

  // If no active contract, show message
  if (!contract) {
    return (
      <div className="p-5 md:p-8 max-w-2xl">
        <Link href={`/admin/tenants/${id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ข้อมูลผู้เช่า
        </Link>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400">
          <LogOut className="size-8 mx-auto mb-3 text-slate-300" />
          <p className="font-semibold text-slate-600">ไม่มีสัญญาเช่าที่ยังใช้งานอยู่</p>
          <p className="text-sm mt-1">ผู้เช่านี้ไม่มีสัญญา active</p>
        </div>
      </div>
    )
  }

  // Get unpaid bills for this tenant
  const { data: unpaidBills } = await supabase
    .from('bills')
    .select('id, total_amount, billing_month, status')
    .eq('tenant_id', id)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: false })

  const totalUnpaid = (unpaidBills ?? []).reduce((s, b) => s + Number(b.total_amount), 0)

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-2xl">

      {/* ── Header ── */}
      <div>
        <Link href={`/admin/tenants/${id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ข้อมูลผู้เช่า
        </Link>

        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
            <LogOut className="size-5 text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">ดำเนินการ</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">
              ย้ายออก — ห้อง {room?.room_number ?? '—'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {tenant.full_name}
              {room && ` · แถวที่ ${roomRow(room.room_number)}`}
            </p>
          </div>
        </div>
      </div>

      <CheckoutForm
        tenantId={id}
        tenantName={tenant.full_name}
        lineUserId={tenant.line_user_id}
        contractId={contract.id}
        roomId={room?.id ?? ''}
        roomNumber={room?.room_number ?? '—'}
        depositPaid={depositPaid}
        unpaidBills={(unpaidBills ?? []).map((b) => ({
          id:            b.id,
          total_amount:  Number(b.total_amount),
          billing_month: b.billing_month as string,
          status:        b.status as string,
        }))}
        totalUnpaid={totalUnpaid}
      />
    </div>
  )
}
