import Link from 'next/link'
import { ChevronLeft, Droplets, Gauge, ScanEye, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MeterForm, type RoomRow } from './_components/meter-form'
import { resolveMeterBaseline, type ActiveMeterBaseline } from '@/lib/meter-baseline'
import { createSignedStorageUrl } from '@/lib/storage-urls'

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
    .select('water_unit_price, electricity_unit_price, anomaly_threshold_pct, meter_ocr_enabled')
    .eq('id', 1)
    .single()

  const waterRate       = Number(settings?.water_unit_price       ?? 18)
  const electricityRate = Number(settings?.electricity_unit_price  ?? 8)
  const anomalyThreshold = Number(settings?.anomaly_threshold_pct ?? 50)
  const ocrEnabled = settings?.meter_ocr_enabled !== false

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

  const { data: prevReadings } = await supabase
    .from('meter_readings')
    .select('room_id, water_prev, water_curr, electricity_prev, electricity_curr')
    .in('room_id', roomIds)
    .eq('billing_month', prevBillingMonth)

  const { data: thisMonthReadings } = await supabase
    .from('meter_readings')
    .select('room_id, water_prev, water_curr, electricity_prev, electricity_curr, water_image_url, electricity_image_url')
    .in('room_id', roomIds)
    .eq('billing_month', billingMonth)

  const { data: baselineAdjustments } = await supabase
    .from('meter_baseline_adjustments')
    .select('id, room_id, water_baseline, electricity_baseline, reason_code, reason_note')
    .in('room_id', roomIds)
    .eq('effective_billing_month', billingMonth)
    .is('cancelled_at', null)

  const prevMap = Object.fromEntries((prevReadings    ?? []).map((r) => [r.room_id, r]))
  const thisMap = Object.fromEntries((thisMonthReadings ?? []).map((r) => [r.room_id, r]))
  const adjustmentMap = Object.fromEntries((baselineAdjustments ?? []).map((r) => [r.room_id, r]))
  const signedImageMap = Object.fromEntries(await Promise.all((thisMonthReadings ?? []).map(async (reading) => {
    const [water, electricity] = await Promise.all([
      createSignedStorageUrl(supabase, 'meter-photos', reading.water_image_url, 3600),
      createSignedStorageUrl(supabase, 'meter-photos', reading.electricity_image_url, 3600),
    ])
    return [reading.room_id, { water, electricity }] as const
  })))

  type RoomJoin   = { room_number: string; floor: number | null }
  type TenantJoin = { full_name: string }

  const rows: RoomRow[] = contracts.map((c) => {
    const prev   = prevMap[c.room_id]
    const curr   = thisMap[c.room_id]
    const room   = (c.rooms   as unknown as RoomJoin   | null)
    const tenant = (c.tenants as unknown as TenantJoin | null)
    const adjustment = (adjustmentMap[c.room_id] ?? null) as ActiveMeterBaseline
    const baseline = resolveMeterBaseline(
      Number(curr?.water_prev ?? prev?.water_curr ?? 0),
      Number(curr?.electricity_prev ?? prev?.electricity_curr ?? 0),
      adjustment
    )

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
      water_prev:            baseline.water,
      electricity_prev:      baseline.electricity,
      water_curr:            Number(curr?.water_curr ?? 0),
      electricity_curr:      Number(curr?.electricity_curr ?? 0),
      water_image_url:       signedImageMap[c.room_id]?.water ?? null,
      electricity_image_url: signedImageMap[c.room_id]?.electricity ?? null,
      // Anomaly
      prev_water_units:  prevWaterUnits,
      prev_elec_units:   prevElecUnits,
      // Pro-rated
      start_date:        startDate ?? '',
      is_first_month:    isFirstMonth,
      baseline_adjusted: baseline.adjusted,
      baseline_reason:   baseline.reason,
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

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Link
            href={`/bills/meter/review?month=${currentMonth}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 sm:flex-none"
          >
            <ScanEye className="size-4" /> ตรวจทานมิเตอร์
          </Link>
          <Link
            href={`/meter-baselines?month=${currentMonth}`}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 sm:flex-none"
          >
            <Gauge className="size-4" /> ปรับฐานมิเตอร์
          </Link>
          {/* Month switcher */}
          <form method="get" className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <input
              type="month"
              name="month"
              defaultValue={currentMonth}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm sm:flex-none"
            />
            <button
              type="submit"
              className="shrink-0 px-4 py-2 text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-colors text-slate-600"
            >
              ดู
            </button>
          </form>
        </div>
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
          ocrEnabled={ocrEnabled}
        />
      </div>
    </div>
  )
}

