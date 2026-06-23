import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { getPendingSlip, getTenantOutstandingBills, getAllTenantsForSelect } from '@/app/actions/payment-reviews'
import { ReviewForm } from './_components/review-form'

const dateFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const thaiMonth = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

const statusLabels: Record<string, { label: string; color: string; desc: string }> = {
  verified:       { label: 'SlipOK ผ่าน',        color: 'text-emerald-700 bg-emerald-50', desc: 'SlipOK ตรวจสลิปผ่าน แต่จับคู่บิลไม่ได้' },
  failed:         { label: 'SlipOK ตรวจไม่ผ่าน', color: 'text-red-700 bg-red-50',         desc: 'SlipOK ตรวจสลิปไม่ผ่าน กรุณาตรวจสอบด้วยตัวเอง' },
  not_configured: { label: 'ไม่ได้ตั้งค่า SlipOK', color: 'text-slate-600 bg-slate-100',  desc: 'ยังไม่ได้ตั้งค่า SlipOK ระบบเก็บสลิปไว้ให้เจ้าของตรวจ' },
  ambiguous:      { label: 'หลายบิลอาจตรงกัน',  color: 'text-amber-700 bg-amber-50',      desc: 'พบบิลที่อาจตรงกันหลายรายการ กรุณาเลือกเอง' },
  no_match:       { label: 'ไม่พบบิลตรงยอด',    color: 'text-orange-700 bg-orange-50',    desc: 'ไม่พบบิลที่ยอดตรงกัน อาจเป็นชำระบางส่วนหรือยอดรวมหลายบิล' },
  download_error: { label: 'ดาวน์โหลดรูปไม่ได้', color: 'text-rose-700 bg-rose-50',      desc: 'ไม่สามารถดาวน์โหลดรูปสลิปจาก LINE ได้' },
}

const matchRuleLabels: Record<string, { label: string; color: string }> = {
  unique_single_bill:    { label: 'unique_single_bill',    color: 'text-emerald-700 bg-emerald-50' },
  unique_single_overpay: { label: 'unique_single_overpay', color: 'text-teal-700 bg-teal-50' },
  total_all_outstanding: { label: 'total_all_outstanding', color: 'text-emerald-700 bg-emerald-50' },
  total_all_overpay:     { label: 'total_all_overpay',     color: 'text-teal-700 bg-teal-50' },
  single_room_total:     { label: 'single_room_total',     color: 'text-emerald-700 bg-emerald-50' },
  single_room_overpay:   { label: 'single_room_overpay',   color: 'text-teal-700 bg-teal-50' },
  ambiguous:             { label: 'ambiguous',             color: 'text-amber-700 bg-amber-50' },
  overpaid:              { label: 'overpaid',              color: 'text-orange-700 bg-orange-50' },
  no_match:              { label: 'no_match',              color: 'text-red-700 bg-red-50' },
  manual_review:         { label: 'manual_review',         color: 'text-slate-600 bg-slate-100' },
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const slip = await getPendingSlip(id)
  if (!slip || slip.status !== 'pending') notFound()

  type TenantJoin = { id: string; full_name: string; phone: string | null; line_user_id: string | null } | null
  type RoomJoin   = { id: string; room_number: string; floor: number | null } | null

  const tenant = slip.tenants as unknown as TenantJoin
  const room   = slip.rooms   as unknown as RoomJoin

  const [outstandingBills, allTenants] = await Promise.all([
    getTenantOutstandingBills(slip.line_user_id, tenant?.id ?? null),
    getAllTenantsForSelect(),
  ])

  const st = statusLabels[slip.slipok_status] ?? { label: slip.slipok_status, color: 'text-slate-600 bg-slate-100', desc: '' }

  // ตรวจว่า SlipOK แจ้งบัญชีผู้รับไม่ตรง (code 1014 หรือข้อความมีคำว่า "บัญชี...ไม่ตรง")
  const accountMismatch =
    slip.slipok_code === 1014 ||
    Boolean(slip.slipok_message && /บัญชี.*ไม่ตรง|ไม่ตรง.*บัญชี/.test(slip.slipok_message))

  // slipPaidAt is passed raw (UTC) to ReviewForm — client converts to local timezone
  const slipPaidAt = slip.paid_at ?? null

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">

      {/* Back */}
      <Link href="/payment-reviews" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">
        <ChevronLeft className="size-3.5" /> สลิปรอตรวจ
      </Link>

      <div className="grid md:grid-cols-2 gap-6">

        {/* Left: slip image + details */}
        <div className="space-y-4">

          {/* Slip image */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {slip.slip_url ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/pending-slip/${slip.id}`} alt="สลิป" className="w-full max-h-80 object-contain bg-slate-50" />
                <a href={`/api/pending-slip/${slip.id}`} target="_blank" rel="noreferrer"
                  className="absolute top-2 right-2 bg-white rounded-lg px-2 py-1 text-xs flex items-center gap-1 text-slate-600 shadow border border-slate-100 hover:bg-slate-50">
                  <ExternalLink className="size-3" /> ขยาย
                </a>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">ไม่มีรูปสลิป</div>
            )}
          </div>

          {/* Slip info */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.color}`}>{st.label}</span>
              {slip.match_rule && (() => {
                const mr = matchRuleLabels[slip.match_rule] ?? { label: slip.match_rule, color: 'text-slate-600 bg-slate-100' }
                return <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${mr.color}`}>{mr.label}</span>
              })()}
            </div>
            {st.desc && <p className="text-xs text-slate-500">{st.desc}</p>}
            {slip.slipok_message && (
              <p className="text-xs text-red-600 font-mono bg-red-50 px-3 py-2 rounded-lg">{slip.slipok_message}</p>
            )}

            <div className="divide-y divide-slate-50 text-sm">
              {tenant && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">ผู้เช่า</span>
                  <Link href={`/tenants/${tenant.id}`} className="font-semibold text-slate-900 hover:underline">
                    {tenant.full_name}
                  </Link>
                </div>
              )}
              {room && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">ห้อง</span>
                  <span className="font-semibold text-slate-900">ห้อง {room.room_number}</span>
                </div>
              )}
              {slip.amount != null && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">ยอดเงิน (SlipOK)</span>
                  <span className="font-bold text-emerald-600">฿{fmt(Number(slip.amount))}</span>
                </div>
              )}
              {slip.paid_at && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">วันเวลาโอน</span>
                  <span className="font-semibold text-slate-900">{dateFmt(slip.paid_at)}</span>
                </div>
              )}
              {slip.slip_ref && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Ref</span>
                  <span className="font-mono text-slate-900">{slip.slip_ref}</span>
                </div>
              )}
              {slip.sender_name && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">ผู้โอน</span>
                  <span className="font-semibold text-slate-900">{slip.sender_name}</span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-slate-400">ได้รับเมื่อ</span>
                <span className="text-slate-600">{dateFmt(slip.created_at)}</span>
              </div>
            </div>

            {/* Match candidates */}
            {slip.slipok_status === 'ambiguous' && Array.isArray(slip.match_candidates) && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-amber-700 mb-2">บิลที่อาจตรงกัน:</p>
                <div className="space-y-1">
                  {(slip.match_candidates as Array<{ room: string; month: string; remaining: number }>).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-amber-50 px-3 py-2 rounded-lg">
                      <span>ห้อง {c.room} — {thaiMonth(c.month)}</span>
                      <span className="font-bold text-amber-700">฿{fmt(c.remaining)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Outstanding bills preview */}
          {outstandingBills.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">บิลค้างชำระของผู้เช่า</p>
              <div className="space-y-2">
                {outstandingBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold text-slate-800">ห้อง {b.room_number}</span>
                      <span className="text-slate-400 ml-2">{thaiMonth(b.billing_month)}</span>
                    </div>
                    <span className="font-bold text-rose-600">฿{fmt(b.remaining)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: review form */}
        <div>
          <ReviewForm
            slipId={slip.id}
            tenantId={tenant?.id ?? null}
            tenantName={tenant?.full_name ?? null}
            roomId={room?.id ?? null}
            roomNumber={room?.room_number ?? null}
            lineUserId={slip.line_user_id}
            defaultAmount={slip.amount ?? undefined}
            slipPaidAt={slipPaidAt}
            outstandingBills={outstandingBills}
            allTenants={allTenants}
            accountMismatch={accountMismatch}
          />
        </div>
      </div>
    </div>
  )
}
