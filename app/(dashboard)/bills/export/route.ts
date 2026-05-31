import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const month = request.nextUrl.searchParams.get('month')
  const now = new Date()
  const billingMonth = month
    ? `${month}-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: bills }, { data: payments }] = await Promise.all([
    supabase
      .from('bills')
      .select(`
        id, billing_month, due_date, status,
        rent_amount, water_amount, electricity_amount, other_amount, total_amount,
        rooms ( room_number, floor ),
        tenants ( full_name, phone )
      `)
      .eq('billing_month', billingMonth)
      .order('created_at'),
    supabase
      .from('payments')
      .select('bill_id, amount, paid_at, payment_method')
      .order('paid_at', { ascending: false }),
  ])

  if (!bills) return NextResponse.json({ error: 'No data' }, { status: 404 })

  const statusLabel: Record<string, string> = {
    pending: 'รอชำระ', paid: 'ชำระแล้ว', overdue: 'เกินกำหนด', cancelled: 'ยกเลิก',
  }
  const methodLabel: Record<string, string> = {
    cash: 'เงินสด', transfer: 'โอนเงิน', qr: 'QR/PromptPay', other: 'อื่นๆ',
  }

  const paymentsByBill = new Map<string, { totalPaid: number; lastPaidAt: string; method: string }>()
  for (const p of payments ?? []) {
    const existing = paymentsByBill.get(p.bill_id)
    if (!existing) {
      paymentsByBill.set(p.bill_id, { totalPaid: Number(p.amount), lastPaidAt: p.paid_at, method: p.payment_method })
    } else {
      existing.totalPaid += Number(p.amount)
      if (p.paid_at > existing.lastPaidAt) {
        existing.lastPaidAt = p.paid_at
        existing.method = p.payment_method
      }
    }
  }

  const csvHeaders = [
    'ห้อง', 'ชั้น', 'ผู้เช่า', 'เบอร์โทร',
    'ค่าเช่า', 'ค่าน้ำ', 'ค่าไฟ', 'อื่นๆ', 'รวม',
    'ชำระแล้ว', 'ยอดค้าง', 'วิธีชำระ', 'วันที่ชำระ',
    'สถานะ', 'ครบกำหนด',
  ]

  type RoomJoin   = { room_number: string; floor: number | null } | null
  type TenantJoin = { full_name: string; phone: string | null }  | null

  let grandTotal = 0
  let grandPaid  = 0

  const csvRows = bills.map((b) => {
    const room    = b.rooms   as unknown as RoomJoin
    const tenant  = b.tenants as unknown as TenantJoin
    const payment = paymentsByBill.get(b.id)
    const totalPaid = payment?.totalPaid ?? 0
    const outstanding = Math.max(0, Number(b.total_amount) - totalPaid)

    grandTotal += Number(b.total_amount)
    grandPaid  += totalPaid

    return [
      room?.room_number  ?? '',
      room?.floor?.toString() ?? '',
      tenant?.full_name  ?? '',
      tenant?.phone      ?? '',
      b.rent_amount,
      b.water_amount,
      b.electricity_amount,
      b.other_amount,
      b.total_amount,
      totalPaid || '',
      outstanding || '',
      payment ? (methodLabel[payment.method] ?? payment.method) : '',
      payment ? new Date(payment.lastPaidAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
      statusLabel[b.status] ?? b.status,
      b.due_date,
    ]
  })

  // Summary row
  const summaryRow = [
    'รวมทั้งหมด', '', '', '',
    '', '', '', '', grandTotal,
    grandPaid, Math.max(0, grandTotal - grandPaid), '', '',
    '', '',
  ]

  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    csvHeaders.map(escape).join(','),
    ...csvRows.map((row) => row.map(escape).join(',')),
    summaryRow.map(escape).join(','),
  ].join('\r\n')

  const monthStr = billingMonth.substring(0, 7)

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bills-${monthStr}.csv"`,
    },
  })
}
