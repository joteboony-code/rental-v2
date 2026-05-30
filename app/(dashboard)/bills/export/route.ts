import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Month param
  const month = request.nextUrl.searchParams.get('month')
  const now = new Date()
  const billingMonth = month
    ? `${month}-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: bills } = await supabase
    .from('bills')
    .select(`
      billing_month, due_date, status,
      rent_amount, water_amount, electricity_amount, other_amount, total_amount,
      rooms ( room_number, floor ),
      tenants ( full_name, phone )
    `)
    .eq('billing_month', billingMonth)
    .order('created_at')

  if (!bills) return NextResponse.json({ error: 'No data' }, { status: 404 })

  const statusLabel: Record<string, string> = {
    pending: 'รอชำระ', paid: 'ชำระแล้ว', overdue: 'เกินกำหนด', cancelled: 'ยกเลิก',
  }

  const headers = [
    'ห้อง', 'ชั้น', 'ผู้เช่า', 'เบอร์โทร',
    'ค่าเช่า', 'ค่าน้ำ', 'ค่าไฟ', 'อื่นๆ', 'รวม',
    'สถานะ', 'ครบกำหนด',
  ]

  type RoomJoin   = { room_number: string; floor: number | null } | null
  type TenantJoin = { full_name: string; phone: string | null }  | null

  const csvRows = bills.map((b) => {
    const room   = b.rooms   as unknown as RoomJoin
    const tenant = b.tenants as unknown as TenantJoin
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
      statusLabel[b.status] ?? b.status,
      b.due_date,
    ]
  })

  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    headers.map(escape).join(','),
    ...csvRows.map((row) => row.map(escape).join(',')),
  ].join('\r\n')

  const monthStr = billingMonth.substring(0, 7)

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bills-${monthStr}.csv"`,
    },
  })
}
