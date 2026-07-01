import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft } from 'lucide-react'
import { PrintReceiptButton } from './_components/print-receipt-button'
import { createSignedStorageUrl } from '@/lib/storage-urls'

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
      .select(`*, rooms ( room_number, floor ), tenants ( full_name, phone )`)
      .eq('id', id)
      .single(),
    supabase
      .from('payments')
      .select('*')
      .eq('bill_id', id)
      .order('paid_at', { ascending: true }),
    supabase
      .from('settings')
      .select('promptpay_name, promptpay_id, owner_name, owner_signature_url')
      .eq('id', 1)
      .single(),
  ])

  if (!bill) notFound()
  if (settings?.owner_signature_url) {
    settings.owner_signature_url = await createSignedStorageUrl(
      supabase,
      'tenant-documents',
      settings.owner_signature_url,
      900
    )
  }

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string; phone: string | null }

  const room         = bill.rooms   as unknown as RoomJoin   | null
  const tenant       = bill.tenants as unknown as TenantJoin | null
  const totalPaid    = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const remaining    = Math.max(0, Number(bill.total_amount) - totalPaid)
  const receiptNo    = (payments ?? [])[0]?.receipt_no ?? null
  const propertyName = (settings?.owner_name as string | null) ?? 'หอพัก'
  const isPaid       = bill.status === 'paid'

  const monthLabel = new Date(bill.billing_month).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long',
  })

  const methodLabel: Record<string, string> = {
    cash: 'เงินสด', transfer: 'โอนเงิน', qr: 'QR/PromptPay', other: 'อื่นๆ',
  }

  const lineItems = [
    { label: 'ค่าเช่า',                                          amount: Number(bill.rent_amount),        show: true },
    { label: `ค่าน้ำ (${bill.water_units ?? 0} หน่วย)`,         amount: Number(bill.water_amount),       show: Number(bill.water_amount) > 0 },
    { label: `ค่าไฟ (${bill.electricity_units ?? 0} หน่วย)`,    amount: Number(bill.electricity_amount), show: Number(bill.electricity_amount) > 0 },
    { label: 'ค่า WiFi',                                         amount: Number(bill.wifi_amount ?? 0),  show: Number(bill.wifi_amount ?? 0) > 0 },
    { label: 'ค่าขยะ/ส่วนกลาง',                                  amount: Number(bill.trash_amount ?? 0), show: Number(bill.trash_amount ?? 0) > 0 },
    { label: `อื่นๆ${bill.other_note ? ` (${bill.other_note})` : ''}`, amount: Number(bill.other_amount ?? 0), show: Number(bill.other_amount ?? 0) > 0 },
  ]

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const printDate = new Date().toLocaleDateString('th-TH', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; margin: 0; padding: 0; }
          .receipt-paper {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 28px 32px !important;
          }
        }
        @page { size: A5; margin: 0; }
      `}</style>

      {/* Top bar — hidden on print */}
      <div className="no-print flex items-center justify-between p-5 md:px-8 max-w-2xl mx-auto">
        <Link
          href={`/bills/${id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ChevronLeft className="size-3.5" /> กลับ
        </Link>
        <PrintReceiptButton />
      </div>

      {/* ── Receipt paper ── */}
      <div className="flex justify-center px-4 pb-16 no-print-padding">
        <div
          className="receipt-paper bg-white w-full max-w-[420px] shadow-xl border border-slate-200 rounded-2xl"
          style={{ padding: '32px 36px', fontFamily: 'sans-serif' }}
        >
          {/* ── Header ── */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 11, letterSpacing: 3, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
              ใบเสร็จรับเงิน
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
              {propertyName}
            </p>
            {receiptNo && (
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontFamily: 'monospace' }}>
                เลขที่: {receiptNo}
              </p>
            )}
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              วันที่พิมพ์: {printDate}
            </p>
          </div>

          {/* ── Tenant / Room info ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 20, fontSize: 13 }}>
            <div>
              <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>ผู้เช่า</p>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>{tenant?.full_name ?? '—'}</p>
              {tenant?.phone && <p style={{ color: '#64748b', margin: 0 }}>{tenant.phone}</p>}
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>ห้อง</p>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>ห้อง {room?.room_number ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>ประจำเดือน</p>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>{monthLabel}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>ครบกำหนด</p>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {new Date(bill.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* ── Line items ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 0 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>รายการ</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.filter(l => l.show).map((item, i, arr) => (
                <tr key={item.label} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <td style={{ padding: '9px 10px', color: '#334155' }}>{item.label}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>฿{fmt(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0f172a' }}>
                <td style={{ padding: '11px 10px', color: 'white', fontWeight: 700, fontSize: 14 }}>รวมทั้งหมด</td>
                <td style={{ padding: '11px 10px', textAlign: 'right', color: 'white', fontWeight: 800, fontSize: 16 }}>
                  ฿{fmt(Number(bill.total_amount))}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* ── Payment records ── */}
          {payments && payments.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px dashed #cbd5e1', paddingTop: 16 }}>
              <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
                การชำระเงิน
              </p>
              {payments.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{methodLabel[p.payment_method as string] ?? p.payment_method}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>
                      {new Date(p.paid_at as string).toLocaleDateString('th-TH', {
                        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
                      })}
                    </span>
                    {p.note && <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>{p.note}</span>}
                  </div>
                  <span style={{ fontWeight: 700, color: '#059669' }}>฿{fmt(Number(p.amount))}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontWeight: 700, fontSize: 13 }}>
                <span style={{ color: '#334155' }}>รวมชำระแล้ว</span>
                <span style={{ color: '#059669' }}>฿{fmt(totalPaid)}</span>
              </div>
            </div>
          )}

          {/* ── Remaining ── */}
          {remaining > 0 && (
            <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: '#b45309' }}>ยอดคงเหลือ</span>
              <span style={{ fontWeight: 800, color: '#b45309' }}>฿{fmt(remaining)}</span>
            </div>
          )}

          {/* ── Paid stamp ── */}
          {isPaid && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <div style={{
                border: '3px solid #059669', borderRadius: 8, padding: '6px 24px',
                color: '#059669', fontWeight: 900, fontSize: 20, letterSpacing: 4,
                transform: 'rotate(-8deg)', opacity: 0.85,
              }}>
                ชำระแล้ว
              </div>
            </div>
          )}

          {/* ── Signature ── */}
          <div style={{ marginTop: 28, borderTop: '1px solid #e2e8f0', paddingTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', width: 160 }}>
              {settings?.owner_signature_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.owner_signature_url as string}
                  alt="ลายเซ็นผู้รับเงิน"
                  style={{ width: 140, height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }}
                />
              ) : (
                <div style={{ height: 60, marginBottom: 4 }} />
              )}
              <div style={{ borderBottom: '1px solid #94a3b8', marginBottom: 6 }} />
              <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>ผู้รับเงิน</p>
              {settings?.owner_name && (
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{settings.owner_name as string}</p>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ marginTop: 20, textAlign: 'center', borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
            <p style={{ fontSize: 10, color: '#cbd5e1', letterSpacing: 1 }}>ขอบคุณที่ใช้บริการ</p>
          </div>
        </div>
      </div>
    </>
  )
}
