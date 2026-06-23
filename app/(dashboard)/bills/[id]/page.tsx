import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BillStatusBadge } from '../_components/bill-status-badge'
import { PromptPayQR } from './_components/promptpay-qr'
import { PaymentForm } from './_components/payment-form'
import { DeletePaymentButton } from './_components/delete-payment-button'
import { ChevronLeft, Droplets, Zap, Wifi, Trash2, Home, User, Receipt, CreditCard, MessageCircle, CalendarClock } from 'lucide-react'
import { PrintButton } from './_components/print-button'
import { roomRow } from '@/lib/room-utils'
import { LineNotifyButton } from './_components/line-notify-button'
import { SendPaymentConfirmedButton } from './_components/send-payment-confirmed-button'
import { EditBillForm } from './_components/edit-bill-form'
import { DeleteBillButton } from './_components/delete-bill-button'
import { PromiseButton } from './_components/promise-button'
import { getActivePromiseForBill } from '@/app/actions/promises'

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: bill }, { data: payments }, { data: settings }] = await Promise.all([
    supabase
      .from('bills')
      .select(`
        *,
        rooms ( room_number, floor ),
        tenants ( full_name, phone, line_user_id ),
        meter_readings ( water_prev, water_curr, water_units, electricity_prev, electricity_curr, electricity_units, water_image_url, electricity_image_url )
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('payments')
      .select('*')
      .eq('bill_id', id)
      .order('paid_at', { ascending: false }),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ])

  if (!bill) notFound()

  const activePromise = bill.status !== 'paid' ? await getActivePromiseForBill(id) : null

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; phone: string | null; line_user_id: string | null }
  type MeterJoin  = { water_prev: number; water_curr: number; water_units: number; electricity_prev: number; electricity_curr: number; electricity_units: number; water_image_url: string | null; electricity_image_url: string | null }

  const room   = bill.rooms          as unknown as RoomJoin   | null
  const tenant = bill.tenants        as unknown as TenantJoin | null
  const meter  = bill.meter_readings as unknown as MeterJoin  | null

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const remaining = Math.max(0, Number(bill.total_amount) - totalPaid)
  const currentBillingMonth = (settings?.current_billing_month as string | null) ?? null
  const isOldBill = Boolean(currentBillingMonth && bill.billing_month.slice(0, 7) !== currentBillingMonth.slice(0, 7))

  const monthLabel = new Date(bill.billing_month).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long',
  })

  const methodLabel: Record<string, string> = {
    cash: 'เงินสด', transfer: 'โอนเงิน', qr: 'QR/PromptPay', other: 'อื่นๆ',
  }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div>
        <Link href="/bills"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> บิลทั้งหมด
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ประจำเดือน {monthLabel}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">
              ห้อง {room?.room_number ?? '—'}
            </h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-3">
              {room && <span className="flex items-center gap-1"><Home className="size-3.5" /> แถวที่ {roomRow(room.room_number)}</span>}
              {tenant && <span className="flex items-center gap-1"><User className="size-3.5" /> {tenant.full_name}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {bill.status !== 'cancelled' && (
              <EditBillForm
                billId={id}
                rentAmount={Number(bill.rent_amount)}
                waterPrev={Number(meter?.water_prev ?? 0)}
                waterCurr={Number(meter?.water_curr ?? 0)}
                electricityPrev={Number(meter?.electricity_prev ?? 0)}
                electricityCurr={Number(meter?.electricity_curr ?? 0)}
                wifiAmount={Number(bill.wifi_amount ?? 0)}
                trashAmount={Number(bill.trash_amount ?? 0)}
                otherAmount={Number(bill.other_amount ?? 0)}
                otherNote={bill.other_note ?? null}
                waterRate={Number(settings?.water_unit_price ?? 18)}
                electricityRate={Number(settings?.electricity_unit_price ?? 8)}
              />
            )}
            <PrintButton />
            <DeleteBillButton billId={id} roomNumber={room?.room_number ?? '—'} month={monthLabel} />
            {isOldBill && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                บิลเก่า
              </span>
            )}
            <BillStatusBadge status={bill.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* ─── Left: Bill Breakdown ─── */}
        <div className="md:col-span-2 space-y-4">

          {/* Bill summary */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Receipt className="size-3.5" /> รายการในบิล
            </p>

            <div className="space-y-1">
              <BillRow label="ค่าเช่า" amount={Number(bill.rent_amount)} />

              <BillRow
                label={
                  <span className="flex items-center gap-1.5">
                    <Droplets className="size-3.5 text-blue-500" />
                    <span className="text-blue-700">ค่าน้ำ</span>
                    {meter && (
                      <span className="text-slate-400 font-normal text-xs ml-1">
                        ({meter.water_prev} → {meter.water_curr} = {meter.water_units} หน่วย)
                      </span>
                    )}
                    {meter?.water_image_url && (
                      <a href={meter.water_image_url} target="_blank" rel="noreferrer" className="ml-1 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={meter.water_image_url} alt="มิเตอร์น้ำ"
                          className="size-6 rounded object-cover border border-blue-100 hover:opacity-80 transition-opacity" />
                      </a>
                    )}
                  </span>
                }
                amount={Number(bill.water_amount)}
                color="text-blue-700"
              />

              <BillRow
                label={
                  <span className="flex items-center gap-1.5">
                    <Zap className="size-3.5 text-amber-500" />
                    <span className="text-amber-700">ค่าไฟ</span>
                    {meter && (
                      <span className="text-slate-400 font-normal text-xs ml-1">
                        ({meter.electricity_prev} → {meter.electricity_curr} = {meter.electricity_units} หน่วย)
                      </span>
                    )}
                    {meter?.electricity_image_url && (
                      <a href={meter.electricity_image_url} target="_blank" rel="noreferrer" className="ml-1 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={meter.electricity_image_url} alt="มิเตอร์ไฟ"
                          className="size-6 rounded object-cover border border-amber-100 hover:opacity-80 transition-opacity" />
                      </a>
                    )}
                  </span>
                }
                amount={Number(bill.electricity_amount)}
                color="text-amber-700"
              />

              {Number(bill.wifi_amount) > 0 && (
                <BillRow
                  label={
                    <span className="flex items-center gap-1.5">
                      <Wifi className="size-3.5 text-indigo-500" />
                      <span className="text-indigo-700">ค่า WiFi</span>
                    </span>
                  }
                  amount={Number(bill.wifi_amount)}
                  color="text-indigo-700"
                />
              )}

              <BillRow
                label={
                  <span className="flex items-center gap-1.5">
                    <Trash2 className="size-3.5 text-slate-400" />
                    <span className="text-slate-600">ค่าขยะ</span>
                  </span>
                }
                amount={Number(bill.trash_amount)}
              />

              {Number(bill.other_amount) > 0 && (
                <BillRow
                  label={`อื่นๆ${bill.other_note ? ` (${bill.other_note})` : ''}`}
                  amount={Number(bill.other_amount)}
                />
              )}
            </div>

            <div className="border-t border-slate-100 mt-4 pt-4 flex justify-between items-center">
              <span className="font-bold text-slate-950 text-sm">รวมทั้งหมด</span>
              <span className="text-2xl font-bold text-slate-950 tracking-tight">
                ฿{Number(bill.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
              <span>ครบกำหนด: {new Date(bill.due_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              {totalPaid > 0 && (
                <span className={remaining > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {remaining > 0
                    ? `ค้างชำระ ฿${remaining.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                    : '✓ ชำระครบแล้ว'}
                </span>
              )}
            </div>
          </div>

          {/* Payment history */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <CreditCard className="size-3.5" /> ประวัติการชำระ
              </p>
              {totalPaid > 0 && (
                <span className="text-xs font-semibold text-emerald-600">
                  รวม ฿{totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {payments && payments.length > 0 ? (
              <div className="space-y-0">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                    {p.slip_url && (
                      <a href={`/api/slip/${p.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/slip/${p.id}`} alt="slip" className="size-12 object-cover rounded-xl border border-slate-100" />
                      </a>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-950">
                          ฿{Number(p.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs bg-slate-100 rounded-lg px-2 py-0.5 text-slate-500 font-medium">
                          {methodLabel[p.payment_method] ?? p.payment_method}
                        </span>
                      </div>
                      {p.receipt_no && (
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">{p.receipt_no}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(p.paid_at).toLocaleString('th-TH', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                          timeZone: 'Asia/Bangkok',
                        })}
                      </p>
                      {p.note && <p className="text-xs text-slate-400 mt-0.5">{p.note}</p>}
                    </div>
                    <DeletePaymentButton paymentId={p.id} billId={id} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">ยังไม่มีการชำระเงิน</p>
            )}
          </div>
        </div>

        {/* ─── Right: QR + Payment Form ─── */}
        <div className="space-y-4">

          {bill.status === 'paid' && (
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-6 text-center">
              <div className="size-12 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <p className="font-bold text-emerald-700">ชำระครบแล้ว</p>
              <p className="text-xs text-emerald-600 mt-1 font-semibold">
                ฿{Number(bill.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </p>
              {tenant?.line_user_id && (
                <div className="mt-4 flex justify-center">
                  <SendPaymentConfirmedButton
                    billId={id}
                    hasLineUserId={!!tenant.line_user_id}
                  />
                </div>
              )}
            </div>
          )}

          {/* LINE Notify */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <MessageCircle className="size-3.5 text-green-500" /> แจ้งค่าเช่าผ่าน LINE
            </p>
            <LineNotifyButton
              billId={id}
              hasLineUserId={!!tenant?.line_user_id}
              billingMonth={bill.billing_month}
              currentBillingMonth={currentBillingMonth}
              remaining={remaining}
              status={bill.status}
            />
          </div>

          {bill.status !== 'paid' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 text-center">QR PromptPay</p>
              <PromptPayQR
                promptpayId={settings?.promptpay_id ?? ''}
                promptpayName={settings?.promptpay_name ?? 'ห้องเช่า'}
                amount={remaining > 0 ? remaining : Number(bill.total_amount)}
              />
            </div>
          )}

          {bill.status !== 'paid' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <CalendarClock className="size-3.5 text-amber-500" /> นัดจ่าย
              </p>
              <PromiseButton
                billId={id}
                tenantId={(bill.tenant_id as string) ?? null}
                roomId={(bill.room_id as string) ?? null}
                remainingAmount={remaining}
                activePromise={activePromise}
              />
            </div>
          )}

          {bill.status !== 'paid' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">บันทึกการชำระ</p>
              <PaymentForm billId={id} remainingAmount={remaining} />
            </div>
          )}
        </div>
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
    <div className="flex items-center justify-between text-sm py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold ${color}`}>
        ฿{amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}
