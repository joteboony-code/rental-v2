import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, Printer } from 'lucide-react'
import { PrintReceiptButton } from './_components/print-receipt-button'

export default async function ReceiptPage({
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
        tenants ( full_name, phone )
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('payments')
      .select('*')
      .eq('bill_id', id)
      .order('paid_at', { ascending: true }),
    supabase
      .from('settings')
      .select('promptpay_name, promptpay_id, owner_name')
      .eq('id', 1)
      .single(),
  ])

  if (!bill) notFound()

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; phone: string | null }

  const room   = bill.rooms   as unknown as RoomJoin   | null
  const tenant = bill.tenants as unknown as TenantJoin | null

  const totalPaid    = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const remaining    = Math.max(0, Number(bill.total_amount) - totalPaid)
  const receiptNo    = (payments ?? [])[0]?.receipt_no ?? null
  const propertyName = (settings?.owner_name as string | null) ?? 'หอพัก'

  const monthLabel = new Date(bill.billing_month).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
  })

  const methodLabel: Record<string, string> = {
    cash:     'เงินสด',
    transfer: 'โอนเงิน',
    qr:       'QR/PromptPay',
    other:    'อื่นๆ',
  }

  const lineItems: { label: string; amount: number; show: boolean }[] = [
    { label: 'ค่าเช่า',        amount: Number(bill.rent_amount),        show: true },
    { label: 'ค่าน้ำ',         amount: Number(bill.water_amount),       show: Number(bill.water_amount) > 0 },
    { label: 'ค่าไฟ',          amount: Number(bill.electricity_amount), show: Number(bill.electricity_amount) > 0 },
    { label: 'ค่า WiFi',       amount: Number(bill.wifi_amount ?? 0),   show: Number(bill.wifi_amount ?? 0) > 0 },
    { label: 'ค่าขยะ/ส่วนกลาง', amount: Number(bill.trash_amount ?? 0),  show: Number(bill.trash_amount ?? 0) > 0 },
    {
      label:  `อื่นๆ${bill.other_note ? ` (${bill.other_note})` : ''}`,
      amount: Number(bill.other_amount ?? 0),
      show:   Number(bill.other_amount ?? 0) > 0,
    },
  ]

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <>
      {/* Print media styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Navigation — hidden when printing */}
      <div className="no-print p-5 md:p-8 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <Link
            href={`/bills/${id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ChevronLeft className="size-3.5" /> กลับ
          </Link>
          <PrintReceiptButton />
        </div>
      </div>

      {/* Receipt card */}
      <div className="max-w-2xl mx-auto px-5 pb-10 md:px-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6 print:shadow-none print:border-0 print:rounded-none print:p-6">

          {/* Header */}
          <div className="text-center border-b border-slate-100 pb-6">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">ใบเสร็จรับเงิน</p>
            <h1 className="text-2xl font-bold text-slate-950">{propertyName}</h1>
            {receiptNo && (
              <p className="text-sm text-slate-500 mt-2 font-mono">เลขที่: {receiptNo}</p>
            )}
          </div>

          {/* Tenant & Room info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">ผู้เช่า</p>
              <p className="font-semibold text-slate-800">{tenant?.full_name ?? '—'}</p>
              {tenant?.phone && <p className="text-sm text-slate-500">{tenant.phone}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">ห้อง</p>
              <p className="font-semibold text-slate-800">{room?.room_number ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">เดือน</p>
              <p className="font-semibold text-slate-800">{monthLabel}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">ครบกำหนด</p>
              <p className="font-semibold text-slate-800">
                {new Date(bill.due_date).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Line items */}
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    รายการ
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    จำนวนเงิน
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.filter((l) => l.show).map((item) => (
                  <tr key={item.label} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{item.label}</td>
                    <td className="px-4 py-3 text-right text-slate-800 font-medium">
                      ฿{fmt(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950">
                  <td className="px-4 py-3 font-bold text-white">รวมทั้งหมด</td>
                  <td className="px-4 py-3 text-right font-bold text-white text-lg">
                    ฿{fmt(Number(bill.total_amount))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Payment records */}
          {payments && payments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                การชำระเงิน
              </p>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-sm py-2.5 border-b border-slate-50 last:border-0"
                  >
                    <div>
                      <span className="text-slate-700 font-medium">
                        {methodLabel[p.payment_method as string] ?? p.payment_method}
                      </span>
                      <span className="text-slate-400 text-xs ml-2">
                        {new Date(p.paid_at as string).toLocaleDateString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'Asia/Bangkok',
                        })}
                      </span>
                      {p.receipt_no && (
                        <span className="text-xs font-mono text-slate-500 ml-2">
                          #{p.receipt_no}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-emerald-700">
                      ฿{fmt(Number(p.amount))}
                    </span>
                  </div>
                ))}

                {/* Total paid row */}
                <div className="flex items-center justify-between text-sm pt-2 font-bold">
                  <span className="text-slate-700">รวมชำระแล้ว</span>
                  <span className="text-emerald-700">฿{fmt(totalPaid)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Remaining */}
          {remaining > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-700">ยอดคงเหลือ</span>
              <span className="font-bold text-amber-700">฿{fmt(remaining)}</span>
            </div>
          )}

          {/* Signature line */}
          <div className="border-t border-slate-100 pt-6">
            <div className="flex justify-end">
              <div className="text-center w-48">
                <div className="border-b border-slate-400 pb-1 mb-2 h-12" />
                <p className="text-sm text-slate-600">ผู้รับเงิน</p>
                {settings?.owner_name && (
                  <p className="text-xs text-slate-400 mt-0.5">{settings.owner_name as string}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  วันที่{' '}
                  {new Date().toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
