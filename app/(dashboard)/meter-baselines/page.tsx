import { Gauge, Info } from 'lucide-react'
import { redirect } from 'next/navigation'
import { BaselineManager, type BaselineHistoryItem, type BaselineRoom } from './_components/baseline-manager'
import { normalizeBillingMonth, type MeterBaselineReason } from '@/lib/meter-baseline'
import { bangkokDateKey } from '@/lib/date-utils'
import { getAuthedUser } from '@/lib/require-admin'
import { createClient } from '@/lib/supabase/server'

export default async function MeterBaselinesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  if (!(await getAuthedUser())) redirect('/login')
  const { month } = await searchParams
  const defaultMonth = bangkokDateKey().slice(0, 7)
  const billingMonth = normalizeBillingMonth(month ?? defaultMonth) ?? `${defaultMonth}-01`
  const selectedMonth = billingMonth.slice(0, 7)
  const supabase = await createClient()

  const [{ data: allRooms }, { data: contracts }] = await Promise.all([
    supabase.from('rooms').select('id, room_number, floor'),
    supabase
      .from('contracts')
      .select('room_id, tenants(full_name)')
      .eq('status', 'active'),
  ])

  type ContractRow = {
    room_id: string
    tenants: { full_name: string } | null
  }
  const uniqueContracts = new Map<string, ContractRow>()
  for (const raw of contracts ?? []) {
    const contract = raw as unknown as ContractRow
    uniqueContracts.set(contract.room_id, contract)
  }
  const roomIds = (allRooms ?? []).map((room) => room.id)

  const [previousResult, adjustmentResult, historyResult, billsResult] = roomIds.length > 0
    ? await Promise.all([
        supabase
          .from('meter_readings')
          .select('room_id, billing_month, water_curr, electricity_curr')
          .in('room_id', roomIds)
          .lt('billing_month', billingMonth)
          .order('billing_month', { ascending: false }),
        supabase
          .from('meter_baseline_adjustments')
          .select('id, room_id, effective_billing_month, previous_water_baseline, previous_electric_baseline, water_baseline, electricity_baseline, reason_code, reason_note, water_image_url, electricity_image_url, created_at')
          .in('room_id', roomIds)
          .eq('effective_billing_month', billingMonth)
          .is('cancelled_at', null),
        supabase
          .from('meter_baseline_adjustments')
          .select('id, room_id, effective_billing_month, previous_water_baseline, previous_electric_baseline, water_baseline, electricity_baseline, reason_code, reason_note, water_image_url, electricity_image_url, created_at, cancelled_at, cancellation_note, rooms(room_number)')
          .in('room_id', roomIds)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('bills')
          .select('room_id, billing_month, status')
          .in('room_id', roomIds)
          .order('billing_month', { ascending: false })
          .limit(500),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]

  const previousByRoom = new Map<string, { water: number; electricity: number }>()
  for (const reading of previousResult.data ?? []) {
    if (!previousByRoom.has(reading.room_id)) {
      previousByRoom.set(reading.room_id, {
        water: Number(reading.water_curr),
        electricity: Number(reading.electricity_curr),
      })
    }
  }

  type AdjustmentRow = {
    id: string
    room_id: string
    effective_billing_month: string
    previous_water_baseline: number
    previous_electric_baseline: number
    water_baseline: number
    electricity_baseline: number
    reason_code: MeterBaselineReason
    reason_note: string | null
    water_image_url: string | null
    electricity_image_url: string | null
    created_at: string
  }
  const adjustmentByRoom = new Map<string, AdjustmentRow>()
  for (const raw of adjustmentResult.data ?? []) {
    const adjustment = raw as unknown as AdjustmentRow
    adjustmentByRoom.set(adjustment.room_id, adjustment)
  }
  const billByRoomMonth = new Map((billsResult.data ?? []).map((bill) => [`${bill.room_id}:${bill.billing_month}`, bill.status]))

  const rooms: BaselineRoom[] = (allRooms ?? [])
    .map((room) => {
      const contract = uniqueContracts.get(room.id)
      const previous = previousByRoom.get(room.id) ?? { water: 0, electricity: 0 }
      const adjustment = adjustmentByRoom.get(room.id)
      return {
        id: room.id,
        roomNumber: room.room_number,
        floor: room.floor ?? null,
        tenantName: contract?.tenants?.full_name ?? 'ห้องว่าง',
        previousWater: previous.water,
        previousElectricity: previous.electricity,
        billStatus: billByRoomMonth.get(`${room.id}:${billingMonth}`) ?? null,
        activeAdjustment: adjustment
          ? {
              id: adjustment.id,
              waterBaseline: Number(adjustment.water_baseline),
              electricityBaseline: Number(adjustment.electricity_baseline),
              reasonCode: adjustment.reason_code,
              reasonNote: adjustment.reason_note,
              waterImageUrl: adjustment.water_image_url,
              electricityImageUrl: adjustment.electricity_image_url,
              createdAt: adjustment.created_at,
            }
          : null,
      }
    })
    .sort((a, b) => (Number(a.roomNumber) || 0) - (Number(b.roomNumber) || 0))

  const history = (historyResult.data ?? []).map((raw) => {
    const item = raw as unknown as {
      id: string
      room_id: string
      effective_billing_month: string
      previous_water_baseline: number
      previous_electric_baseline: number
      water_baseline: number
      electricity_baseline: number
      reason_code: BaselineHistoryItem['reasonCode']
      reason_note: string | null
      water_image_url: string | null
      electricity_image_url: string | null
      created_at: string
      cancelled_at: string | null
      cancellation_note: string | null
      rooms: { room_number: string } | null
    }
    return {
      id: item.id,
      roomId: item.room_id,
      roomNumber: item.rooms?.room_number ?? '-',
      billingMonth: item.effective_billing_month,
      previousWater: Number(item.previous_water_baseline),
      previousElectricity: Number(item.previous_electric_baseline),
      waterBaseline: Number(item.water_baseline),
      electricityBaseline: Number(item.electricity_baseline),
      reasonCode: item.reason_code,
      reasonNote: item.reason_note,
      waterImageUrl: item.water_image_url,
      electricityImageUrl: item.electricity_image_url,
      createdAt: item.created_at,
      cancelledAt: item.cancelled_at,
      cancellationNote: item.cancellation_note,
      billCreated: billByRoomMonth.has(`${item.room_id}:${item.effective_billing_month}`),
    } satisfies BaselineHistoryItem
  })

  const setupError = adjustmentResult.error || historyResult.error
    ? 'ยังไม่พบตารางปรับฐานมิเตอร์ กรุณารัน migration 202608120001_meter_baseline_adjustments.sql ก่อนใช้งาน'
    : null

  return (
    <div className="max-w-6xl space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-md shadow-slate-900/20">
            <Gauge className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">ปรับฐานมิเตอร์</h1>
            <p className="text-sm text-slate-400">ใช้เมื่อซ่อมห้อง เปลี่ยนมิเตอร์ หรือมีหน่วยที่เจ้าของรับผิดชอบ</p>
          </div>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input type="month" name="month" defaultValue={selectedMonth} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" />
          <button type="submit" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50">ดู</button>
        </form>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <Info className="mt-0.5 size-4 shrink-0" />
        การปรับฐานมีผลเฉพาะการคำนวณรอบ {selectedMonth} และไม่ย้อนกลับไปแก้บิลเดือนเก่า ระบบจะไม่อนุญาตหากออกบิลรอบนี้แล้ว
      </div>

      <BaselineManager key={billingMonth} rooms={rooms} history={history} billingMonth={billingMonth} setupError={setupError} />
    </div>
  )
}
