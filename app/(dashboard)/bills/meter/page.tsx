import Link from 'next/link'
import { ChevronLeft, Droplets, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MeterForm, type RoomRow } from './_components/meter-form'

interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function MeterReadingPage({ searchParams }: Props) {
  const { month } = await searchParams

  const now = new Date()
  const currentMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yearStr, monthStr] = currentMonth.split('-')
  const billingMonth = `${yearStr}-${monthStr}-01`

  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('settings')
    .select('water_unit_price, electricity_unit_price')
    .eq('id', 1)
    .single()

  const waterRate       = Number(settings?.water_unit_price       ?? 18)
  const electricityRate = Number(settings?.electricity_unit_price  ?? 8)

  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id,
      monthly_rent,
      tenant_id,
      room_id,
      start_date,
      rooms ( id, room_number, floor ),
      tenants ( full_name )
    `)
    .eq('status', 'active')
    .order('created_at')

  if (!contracts || contracts.length === 0) {
    return (
      <div className="p-5 md:p-8 max-w-5xl space-y-6">
        <div>
          <Link href="/bills"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
            <ChevronLeft className="size-3.5" /> บิลทั้งหมด
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">บันทึกมิเตอร์</h1>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-20 text-center text-slate-400">
          <p className="font-semibold text-slate-600">ยังไม่มีห้องที่มีสัญญาเช่า</p>
        </div>
      </div>
    )
  }

  const roomIds = contracts.map((c) => c.room_id)

  const prevMonthDate = new Date(parseInt(yearStr), parseInt(monthStr) - 2, 1)
  const prevBillingMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`

  // Also fetch anomaly threshold from settings
  const { data: settingsForAnomaly } = await supabase
    .from('settings')
    .select('anomaly_threshold_pct')
    .eq('id', 1)
    .single()
  const anomalyThreshold = Number(settingsForAnomaly?.anomaly_threshold_pct ?? 50)

  const { data: prevReadings } = await supabase
    .from('meter_readings')
    .select('room_id, water_prev, water_curr, electricity_prev, electricity_curr')
    .in('room_id', roomIds)
    .eq('billing_month', prevBillingMonth)

  const { data: thisMonthReadings } = await supabase
    .from('meter_readings')
    .select('room_id, water_prev, water_curr, electricity_prev, electricity_curr')
    .in('room_id', roomIds)
    .eq('billing_month', billingMonth)

  const prevMap = Object.fromEntries((prevReadings    ?? []).map((r) => [r.room_id, r]))
  const thisMap = Object.fromEntries((thisMonthReadings ?? []).map((r) => [r.room_id, r]))

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string }

  const rows: RoomRow[] = contracts.map((c) => {
    const prev   = prevMap[c.room_id]
    const curr   = thisMap[c.room_id]
    const room   = (c.rooms   as unknown as RoomJoin   | null)
    const tenant = (c.tenants as unknown as TenantJoin | null)

    // Previous month units (for anomaly detection)
    const prevWaterUnits = prev ? Number(prev.water_curr)       - Number(prev.water_prev)       : null
    const prevElecUnits  = prev ? Number(prev.electricity_curr) - Number(prev.electricity_prev) : null

    // Pro-rated rent: is this the first billing month?
    const startDate      = c.start_date as string | null  // "YYYY-MM-DD"
    const isFirstMonth   = !!startDate && startDate.slice(0, 7) === billingMonth.slice(0, 7)

    return {
      room_id:           c.room_id,
      room_number:       room?.room_number ?? '—',
      floor:             room?.floor ?? null,
      tenant_name:       tenant?.full_name ?? '—',
      contract_id:       c.id,
      tenant_id:         c.tenant_id,
      rent:              Number(c.monthly_rent),
      water_prev:        Number(curr?.water_prev ?? prev?.water_curr ?? 0),
      electricity_prev:  Number(curr?.electricity_prev ?? prev?.electricity_curr ?? 0),
      water_curr:        Number(curr?.water_curr ?? 0),
      electricity_curr:  Number(curr?.electricity_curr ?? 0),
      // Anomaly
      prev_water_units:  prevWaterUnits,
      prev_elec_units:   prevElecUnits,
      // Pro-rated
      start_date:        startDate ?? '',
      is_first_month:    isFirstMonth,
    }
  })
  // numeric sort (room_number stored as text → "10" < "2" alphabetically)
  rows.sort((a, b) => (parseInt(a.room_number) || 0) - (parseInt(b.room_number) || 0))

  const monthLabel = new Date(billingMonth).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
  })

  return (
    <div className="p-5 md:p-8 max-w-6xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <Link href="/bills"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-4 transition-colors">
            <ChevronLeft className="size-3.5" /> บิลทั้งหมด
          </Link>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">ประจำเดือน {monthLabel}</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">บันทึกมิเตอร์ + ออกบิล</h1>
        </div>

        {/* Month switcher */}
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={currentMonth}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-colors text-slate-600"
          >
            ดู
          </button>
        </form>
      </div>

      {/* Rate info */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3.5">
        <span className="flex items-center gap-2 text-sm text-slate-600">
          <Droplets className="size-4 text-blue-500" />
          น้ำ <strong className="text-blue-700 ml-1">{waterRate} บาท/หน่วย</strong>
        </span>
        <span className="flex items-center gap-2 text-sm text-slate-600">
          <Zap className="size-4 text-amber-500" />
          ไฟ <strong className="text-amber-700 ml-1">{electricityRate} บาท/หน่วย</strong>
        </span>
        <Link href="/settings"
          className="sm:ml-auto text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">
          แก้ไขอัตรา →
        </Link>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <MeterForm
          rooms={rows}
          billingMonth={billingMonth}
          waterRate={waterRate}
          electricityRate={electricityRate}
          anomalyThreshold={anomalyThreshold}
        />
      </div>
    </div>
  )
}

