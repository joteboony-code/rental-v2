export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { createSignedStorageUrl } from '@/lib/storage-urls'
import { Droplets, Zap, Wifi, Trash2, User, Phone, CheckCircle, Clock, AlertTriangle, Camera } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { verifyBillToken } from '@/lib/portal-url'
import { isBillPayable } from '@/lib/billing'
import { BankAccountCard } from '../_components/bank-account-card'

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { billId } = await params
  const sp = await searchParams
  const token = typeof sp.t === 'string' ? sp.t : ''

  const hasValidToken = token ? verifyBillToken(billId, token) : false
  if (!hasValidToken) notFound()

  const supabase = createServiceClient()

  const [{ data: bill }, { data: payments }, { data: settings }] = await Promise.all([
    supabase
      .from('bills')
      .select(`
        *,
        rooms   ( room_number, floor ),
        tenants ( full_name, phone ),
        meter_readings ( water_prev, water_curr, water_units, electricity_prev, electricity_curr, electricity_units, water_image_url, electricity_image_url )
      `)
      .eq('id', billId)
      .single(),
    supabase.from('payments').select('amount, payment_method, paid_at').eq('bill_id', billId).order('paid_at'),
    supabase.from('settings').select('promptpay_id, promptpay_name, bank_account_no, bank_account_name, bank_name, bank_name_1, bank_account_no_1, bank_account_name_1, bank_name_2, bank_account_no_2, bank_account_name_2, bank_name_3, bank_account_no_3, bank_account_name_3, bank_name_4, bank_account_no_4, bank_account_name_4, bank_name_5, bank_account_no_5, bank_account_name_5').eq('id', 1).single(),
  ])

  if (!bill) notFound()

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; phone: string | null }
  type MeterJoin  = { water_prev: number; water_curr: number; water_units: number; electricity_prev: number; electricity_curr: number; electricity_units: number; water_image_url: string | null; electricity_image_url: string | null }

  const room   = bill.rooms          as unknown as RoomJoin   | null
  const tenant = bill.tenants        as unknown as TenantJoin | null
  const meter  = bill.meter_readings as unknown as MeterJoin  | null

  // สร้าง signed URLs สำหรับภาพมิเตอร์ (bucket เป็น private → ต้องมีอายุสั้น)
  const meterImg = { water: null as string | null, electricity: null as string | null }
  if (meter) {
    const [w, e] = await Promise.all([
      createSignedStorageUrl(supabase, 'meter-photos', meter.water_image_url, 3600),
      createSignedStorageUrl(supabase, 'meter-photos', meter.electricity_image_url, 3600),
    ])
    meterImg.water = w
    meterImg.electricity = e
  }

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const remaining = Math.max(0, Number(bill.total_amount) - totalPaid)
  const payable = isBillPayable(bill.status, remaining)

  const month = new Date(bill.billing_month).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
  const dueDate = new Date(bill.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })

  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

  // ปกปิดเบอร์โทร — หน้านี้เปิดผ่านลิงก์ที่ส่งทาง LINE หากลิงก์รั่วจะไม่เผยเบอร์เต็ม
  const maskPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 3) return phone
    return `${digits.slice(0, 2)}x-xxx-xxxx`
  }

  type StatusKey = 'paid' | 'pending' | 'overdue' | 'cancelled'
  const statusMap: Record<StatusKey, { bg: string; text: string; icon: React.ElementType }> = {
    paid:      { bg: 'bg-emerald-500', text: 'ชำระแล้ว',   icon: CheckCircle   },
    pending:   { bg: 'bg-amber-400',   text: 'รอชำระ',     icon: Clock         },
    overdue:   { bg: 'bg-rose-500',    text: 'เกินกำหนด',  icon: AlertTriangle },
    cancelled: { bg: 'bg-slate-400',   text: 'ยกเลิก',     icon: CheckCircle   },
  }
  const statusCfg = statusMap[bill.status as StatusKey] ?? { bg: 'bg-slate-400', text: bill.status, icon: Clock }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#0C1B4D] text-white px-5 pt-14 pb-8 safe-top">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-1">ใบแจ้งค่าเช่า · {month}</p>
        <h1 className="text-3xl font-bold tracking-tight mb-1">ห้อง {room?.room_number ?? '—'}</h1>
        {room && <p className="text-slate-400 text-sm">แถวที่ {roomRow(room.room_number)}</p>}

        <div className="flex items-center gap-4 mt-4">
          {hasValidToken && tenant && (
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <User className="size-3.5" /> {tenant.full_name}
            </div>
          )}
          {hasValidToken && tenant?.phone && (
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <Phone className="size-3.5" /> {maskPhone(tenant.phone)}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className={`inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full text-xs font-bold ${statusCfg.bg} text-white`}>
          <statusCfg.icon className="size-3.5" />
          {statusCfg.text}
        </div>
      </div>

      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">

        {/* Bill Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">รายการในบิล</p>
          </div>
          <div className="px-5 py-4 space-y-0">

            <BillRow label="ค่าเช่า" amount={Number(bill.rent_amount)} />

            <BillRow
              label={
                <span className="flex items-center gap-1.5 text-blue-600">
                  <Droplets className="size-3.5" /> ค่าน้ำ
                  {meter && (
                    <span className="text-slate-400 text-xs font-normal">
                      ({meter.water_prev}→{meter.water_curr} = {meter.water_units} หน่วย)
                    </span>
                  )}
                </span>
              }
              amount={Number(bill.water_amount)}
              color="text-blue-700"
            />

            <BillRow
              label={
                <span className="flex items-center gap-1.5 text-amber-600">
                  <Zap className="size-3.5" /> ค่าไฟ
                  {meter && (
                    <span className="text-slate-400 text-xs font-normal">
                      ({meter.electricity_prev}→{meter.electricity_curr} = {meter.electricity_units} หน่วย)
                    </span>
                  )}
                </span>
              }
              amount={Number(bill.electricity_amount)}
              color="text-amber-700"
            />

            {Number(bill.wifi_amount) > 0 && (
              <BillRow
                label={
                  <span className="flex items-center gap-1.5 text-indigo-600">
                    <Wifi className="size-3.5" /> ค่า WiFi
                  </span>
                }
                amount={Number(bill.wifi_amount)}
                color="text-indigo-700"
              />
            )}

            <BillRow
              label={
                <span className="flex items-center gap-1.5 text-slate-600">
                  <Trash2 className="size-3.5" /> ค่าขยะ
                </span>
              }
              amount={Number(bill.trash_amount)}
            />

            {Number(bill.other_amount) > 0 && (
              <BillRow label={`อื่นๆ${bill.other_note ? ` (${bill.other_note})` : ''}`} amount={Number(bill.other_amount)} />
            )}

            <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between items-center">
              <span className="font-bold text-slate-950">รวมทั้งหมด</span>
              <span className="text-2xl font-bold text-slate-950 tracking-tight">฿{fmt(Number(bill.total_amount))}</span>
            </div>

            <p className="text-xs text-slate-400 pt-1">
              ครบกำหนดชำระ: <span className="font-semibold text-rose-500">{dueDate}</span>
            </p>
          </div>
        </div>

        {/* รูปมิเตอร์ */}
        {(meterImg.water || meterImg.electricity) && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Camera className="size-4 text-slate-400" />
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">รูปมิเตอร์เดือนนี้</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {meterImg.water && (
                <a href={meterImg.water} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meterImg.water} alt="รูปมิเตอร์น้ำ" className="aspect-square w-full object-cover" />
                  <p className="bg-slate-50 px-2 py-1.5 text-center text-xs text-slate-500">มิเตอร์น้ำ</p>
                </a>
              )}
              {meterImg.electricity && (
                <a href={meterImg.electricity} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meterImg.electricity} alt="รูปมิเตอร์ไฟ" className="aspect-square w-full object-cover" />
                  <p className="bg-slate-50 px-2 py-1.5 text-center text-xs text-slate-500">มิเตอร์ไฟ</p>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Payment status */}
        {totalPaid > 0 && (
          <div className={`rounded-2xl p-4 flex items-center justify-between ${remaining > 0 ? 'bg-amber-50 border border-amber-100' : 'bg-emerald-50 border border-emerald-100'}`}>
            <div>
              <p className={`text-xs font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {remaining > 0 ? 'ชำระแล้วบางส่วน' : '✓ ชำระครบแล้ว'}
              </p>
              <p className="text-sm font-bold text-slate-800">ชำระแล้ว ฿{fmt(totalPaid)}</p>
            </div>
            {remaining > 0 && (
              <div className="text-right">
                <p className="text-xs text-amber-600">ยังค้างชำระ</p>
                <p className="text-lg font-bold text-amber-700">฿{fmt(remaining)}</p>
              </div>
            )}
          </div>
        )}

        {/* ชำระผ่านเลขบัญชี */}
        {(() => {
          const s = settings as Record<string, string | null> | null
          const row = room ? roomRow(room.room_number) : 0
          // เลือกบัญชีตามแถวห้อง (รองรบั 5 แถว)
          const suffix = row >= 1 && row <= 5 ? `_${row}` : ''
          const bankName    = (suffix ? s?.[`bank_name${suffix}`]         : s?.bank_name)         ?? null
          const accountNo   = (suffix ? s?.[`bank_account_no${suffix}`]   : s?.bank_account_no)   ?? null
          const accountName = (suffix ? s?.[`bank_account_name${suffix}`] : s?.bank_account_name) ?? null
          const hasAccount = Boolean(accountNo) || Boolean(s?.promptpay_id)
          if (!payable || !hasAccount) return null
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-0 overflow-hidden">
              <BankAccountCard
                bankAccount={{ bankName, accountNo, accountName }}
                amountLabel={`ชำระยอดคงเหลือ ฿${fmt(remaining)}`}
              />
              {!accountNo && s?.promptpay_id && (
                <p className="px-5 pb-4 text-center text-xs text-amber-600">
                  ยังไม่ได้ตั้งเลขบัญชี กรุณาใช้ QR PromptPay ด้านล่าง
                </p>
              )}
            </div>
          )
        })()}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pb-8">
          กรุณาส่งสลิปให้เจ้าของห้องหลังชำระเงิน
        </p>
      </div>
    </div>
  )
}

function BillRow({
  label,
  amount,
  color = 'text-slate-700',
}: {
  label: React.ReactNode
  amount: number
  color?: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold ${color}`}>
        ฿{amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}




