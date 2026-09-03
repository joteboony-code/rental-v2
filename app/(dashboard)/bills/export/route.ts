import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { roomRow } from '@/lib/room-utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const month = request.nextUrl.searchParams.get('month')
  const year  = request.nextUrl.searchParams.get('year')
  const now   = new Date()

  let billsQuery = supabase
    .from('bills')
    .select(`
      id, billing_month, due_date, status,
      rent_amount, water_amount, electricity_amount,
      wifi_amount, trash_amount, other_amount, total_amount,
      rooms ( room_number, floor ),
      tenants ( full_name, phone )
    `)

  let filename: string
  if (year) {
    billsQuery = billsQuery
      .gte('billing_month', `${year}-01-01`)
      .lte('billing_month', `${year}-12-31`)
    filename = `bills-${year}.csv`
  } else {
    const billingMonth = month
      ? `${month}-01`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    billsQuery = billsQuery.eq('billing_month', billingMonth)
    filename   = `bills-${billingMonth.substring(0, 7)}.csv`
  }

  const { data: bills } = await billsQuery.order('billing_month').order('created_at')
  if (!bills) return NextResponse.json({ error: 'No data' }, { status: 404 })

  // ดึงเฉพาะ payments ของบิลที่อยู่ในช่วงที่ export — กันดึงทั้งตาราง (ชน cap 1000 แถว)
  const billIds = bills.map((b) => b.id)
  const { data: payments } = billIds.length > 0
    ? await supabase
        .from('payments')
        .select('bill_id, amount, paid_at, payment_method')
        .in('bill_id', billIds)
        .order('paid_at', { ascending: false })
    : { data: [] as { bill_id: string; amount: number; paid_at: string; payment_method: string }[] }

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
    ...(year ? ['เดือน'] : []),
    'ห้อง', 'แถว', 'ผู้เช่า', 'เบอร์โทร',
    'ค่าเช่า', 'ค่าน้ำ', 'ค่าไฟ', 'ค่า WiFi', 'ค่าขยะ', 'อื่นๆ', 'รวม',
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
      ...(year ? [b.billing_month?.toString().substring(0, 7) ?? ''] : []),
      room?.room_number  ?? '',
      room?.room_number ? roomRow(room.room_number).toString() : '',
      tenant?.full_name  ?? '',
      tenant?.phone      ?? '',
      b.rent_amount,
      b.water_amount,
      b.electricity_amount,
      b.wifi_amount,
      b.trash_amount,
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
  const summaryRow = csvHeaders.map((header, index) => {
    if (index === 0) return 'รวมทั้งหมด'
    if (header === 'รวม') return grandTotal
    if (header === 'ชำระแล้ว') return grandPaid
    if (header === 'ยอดค้าง') return Math.max(0, grandTotal - grandPaid)
    return ''
  })

  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    csvHeaders.map(escape).join(','),
    ...csvRows.map((row) => row.map(escape).join(',')),
    summaryRow.map(escape).join(','),
  ].join('\r\n')

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
