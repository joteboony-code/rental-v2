import Link from 'next/link'
import { getPendingSlips } from '@/app/actions/payment-reviews'
import { ChevronLeft, Inbox, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

const dateFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const statusLabels: Record<string, { label: string; color: string }> = {
  verified:       { label: 'SlipOK ผ่าน',        color: 'bg-emerald-50 text-emerald-700' },
  failed:         { label: 'SlipOK ตรวจไม่ผ่าน', color: 'bg-red-50 text-red-700' },
  not_configured: { label: 'ไม่ได้ตั้งค่า SlipOK', color: 'bg-slate-100 text-slate-600' },
  ambiguous:      { label: 'หลายบิลอาจตรงกัน',  color: 'bg-amber-50 text-amber-700' },
  no_match:       { label: 'ไม่พบบิลตรงยอด',    color: 'bg-orange-50 text-orange-700' },
  download_error: { label: 'ดาวน์โหลดรูปไม่ได้', color: 'bg-rose-50 text-rose-700' },
}

export default async function PaymentReviewsPage() {
  const slips = await getPendingSlips()

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <Link href="/home" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> หน้าหลัก
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <Inbox className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">รอตรวจสอบ</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">สลิปรอตรวจ</h1>
          </div>
        </div>
      </div>

      {slips.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center">
          <CheckCircle className="size-10 mx-auto mb-3 text-emerald-300" />
          <p className="font-semibold text-slate-700">ไม่มีสลิปรอตรวจ</p>
          <p className="text-sm text-slate-400 mt-1">ทุกสลิปได้รับการตรวจสอบแล้ว</p>
        </div>
      ) : (
        <div className="space-y-3">
          {slips.map((slip) => {
            const st = statusLabels[slip.slipok_status] ?? { label: slip.slipok_status, color: 'bg-slate-100 text-slate-600' }
            const tenant = slip.tenants as unknown as { full_name: string } | null
            const room   = slip.rooms   as unknown as { room_number: string } | null
            return (
              <Link key={slip.id} href={`/payment-reviews/${slip.id}`}
                className="block bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-5">
                <div className="flex items-start gap-4">

                  {/* Slip thumbnail */}
                  <div className="size-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center">
                    {slip.slip_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slip.slip_url} alt="slip" className="size-full object-cover" />
                    ) : (
                      <AlertCircle className="size-6 text-slate-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-900 text-sm">
                        {tenant?.full_name ?? '—'}
                      </span>
                      {room && (
                        <span className="text-xs text-slate-400">ห้อง {room.room_number}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      {slip.amount != null && (
                        <span className="font-bold text-emerald-600 text-sm">฿{fmt(Number(slip.amount))}</span>
                      )}
                      {slip.slip_ref && <span className="font-mono">Ref: {slip.slip_ref}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {dateFmt(slip.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <span className="text-slate-300 text-lg shrink-0">›</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
