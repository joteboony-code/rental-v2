import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, Droplets, Zap, TrendingUp } from 'lucide-react'
import { UsageChart } from './_components/usage-chart'

const monthFmt = (s: string) => {
  const [year, month] = s.slice(0, 7).split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('th-TH', {
    month: 'short',
    year: '2-digit',
  })
}

export default async function RoomUsagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: room }, { data: billsRaw }] = await Promise.all([
    supabase.from('rooms').select('room_number, floor').eq('id', id).single(),
    supabase
      .from('bills')
      .select('billing_month, meter_readings(water_units, electricity_units)')
      .eq('room_id', id)
      .not('meter_reading_id', 'is', null)
      .order('billing_month', { ascending: false })
      .limit(12),
  ])

  if (!room) notFound()

  type MeterJoin = { water_units: number; electricity_units: number } | null

  const bills = (billsRaw ?? []).reverse()
  const chartData = bills.map((b) => {
    const m = b.meter_readings as unknown as MeterJoin
    return {
      month:       monthFmt(b.billing_month as string),
      water:       Number(m?.water_units       ?? 0),
      electricity: Number(m?.electricity_units ?? 0),
    }
  })

  // Avg / Max
  const avgWater = chartData.length
    ? Math.round(chartData.reduce((s, d) => s + d.water, 0) / chartData.length)
    : 0
  const avgElec = chartData.length
    ? Math.round(chartData.reduce((s, d) => s + d.electricity, 0) / chartData.length)
    : 0
  const maxWater = chartData.length ? Math.max(...chartData.map((d) => d.water)) : 0
  const maxElec  = chartData.length ? Math.max(...chartData.map((d) => d.electricity)) : 0

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <Link href="/rooms"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ห้องเช่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-teal-100 flex items-center justify-center shrink-0">
            <TrendingUp className="size-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">ห้อง {room.room_number}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">การใช้น้ำ-ไฟ</h1>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Droplets className="size-4 text-blue-500" />
            <p className="text-xs font-semibold text-slate-500">ค่าน้ำ (เฉลี่ย / สูงสุด)</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">{avgWater} <span className="text-sm font-normal text-slate-400">หน่วย</span></p>
          <p className="text-xs text-slate-400 mt-1">สูงสุด {maxWater} หน่วย</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-amber-500" />
            <p className="text-xs font-semibold text-slate-500">ค่าไฟ (เฉลี่ย / สูงสุด)</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">{avgElec} <span className="text-sm font-normal text-slate-400">หน่วย</span></p>
          <p className="text-xs text-slate-400 mt-1">สูงสุด {maxElec} หน่วย</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-5">
          ย้อนหลัง {chartData.length} เดือน
        </p>
        {chartData.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <TrendingUp className="size-8 mx-auto mb-3 text-slate-200" />
            <p className="text-sm">ยังไม่มีข้อมูลมิเตอร์</p>
          </div>
        ) : (
          <UsageChart data={chartData} />
        )}
      </div>
    </div>
  )
}
