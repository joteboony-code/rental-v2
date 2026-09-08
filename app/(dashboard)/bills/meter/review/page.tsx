import { MeterPhoto } from '@/components/meter-photo'
import Link from 'next/link'
import { AlertCircle, ChevronLeft, Droplets, ImageOff, ScanEye, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { bangkokDateKey } from '@/lib/date-utils'
import { roomRow } from '@/lib/room-utils'
import { createSignedStorageUrls, storageObjectPath } from '@/lib/storage-urls'

export const dynamic = 'force-dynamic'

type Reading = {
  room_id: string
  water_prev: number | string | null
  water_curr: number | string | null
  electricity_prev: number | string | null
  electricity_curr: number | string | null
  water_image_url: string | null
  electricity_image_url: string | null
}

type TenantJoin = { full_name: string } | { full_name: string }[] | null

function tenantName(tenant: TenantJoin) {
  return (Array.isArray(tenant) ? tenant[0] : tenant)?.full_name
}

function formatReading(value: Reading['water_curr'] | undefined) {
  if (value === null || value === undefined) return '—'
  const number = Number(value)
  return Number.isFinite(number)
    ? number.toLocaleString('th-TH', { maximumFractionDigits: 2 })
    : '—'
}

function MeterPanel({ type, roomNumber, previous, current, imageUrl, storedValue }: {
  type: 'water' | 'electricity'
  roomNumber: string
  previous: Reading['water_prev'] | undefined
  current: Reading['water_curr'] | undefined
  imageUrl: string | null | undefined
  storedValue?: string | null
}) {
  const isWater = type === 'water'
  const label = isWater ? 'น้ำ' : 'ไฟฟ้า'
  const Icon = isWater ? Droplets : Zap
  const units = current != null && previous != null ? Number(current) - Number(previous) : null

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`border-b border-slate-100 p-4 md:p-5 ${isWater ? 'bg-blue-50/50' : 'bg-amber-50/50'}`}>
        <h3 className={`flex items-center gap-2 text-sm font-bold ${isWater ? 'text-blue-600' : 'text-amber-600'}`}>
          <Icon className="size-5" /> มิเตอร์{label}
        </h3>
        <p className="mt-3 text-xs font-medium text-slate-500">เลขที่บันทึกไว้ในระบบ</p>
        <p className="mt-1 break-all text-4xl font-bold tabular-nums tracking-tight text-slate-950 md:text-5xl">
          {formatReading(current)}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>ก่อนหน้า <strong className="font-semibold tabular-nums text-slate-700">{formatReading(previous)}</strong></span>
          <span>ใช้ไป <strong className={`font-semibold tabular-nums ${units !== null && units < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{formatReading(units)}</strong> หน่วย</span>
        </div>
      </div>
      {imageUrl || storedValue ? (
        // Keep the uploaded resolution: meter digits must not be cropped or recompressed by an image proxy.
        <MeterPhoto
          src={imageUrl}
          storedValue={storedValue}
          alt={`รูปมิเตอร์${label} ห้อง ${roomNumber} เทียบกับเลขที่บันทึก ${formatReading(current)}`}
          className="block h-auto w-full"
        />
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-slate-400">
          <ImageOff className="size-8" />
          <p className="text-sm">ยังไม่มีรูปมิเตอร์{label}ของเดือนนี้</p>
        </div>
      )}
    </section>
  )
}

export default async function MeterReviewPage({ searchParams }: {
  searchParams: Promise<{ month?: string | string[] }>
}) {
  const { month } = await searchParams
  const currentMonth = typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month
    : bangkokDateKey().slice(0, 7)
  const billingMonth = `${currentMonth}-01`
  const monthLabel = new Date(`${billingMonth}T12:00:00+07:00`).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric',
  })
  const supabase = await createClient()
  const [roomsResult, readingsResult, contractsResult, billsResult] = await Promise.all([
    supabase.from('rooms').select('id, room_number'),
    supabase.from('meter_readings')
      .select('room_id, water_prev, water_curr, electricity_prev, electricity_curr, water_image_url, electricity_image_url')
      .eq('billing_month', billingMonth),
    supabase.from('contracts').select('room_id, tenants(full_name)').eq('status', 'active'),
    supabase.from('bills').select('room_id, tenants(full_name)').eq('billing_month', billingMonth),
  ])

  if ([roomsResult, readingsResult, contractsResult, billsResult].some((result) => result.error)) {
    throw new Error('โหลดข้อมูลตรวจทานมิเตอร์ไม่สำเร็จ กรุณาลองใหม่')
  }

  const rawReadings = (readingsResult.data as Reading[] | null) ?? []
  const signedImages = await createSignedStorageUrls(supabase, 'meter-photos',
    rawReadings.flatMap((r) => [r.water_image_url, r.electricity_image_url]), 3600)
  const readings = new Map(rawReadings.map((reading) => {
    return [reading.room_id, {
      ...reading,
      water_image_url: signedImages.get(reading.water_image_url ?? '') ?? null,
      electricity_image_url: signedImages.get(reading.electricity_image_url ?? '') ?? null,
      water_image_path: storageObjectPath(reading.water_image_url, 'meter-photos'),
      electricity_image_path: storageObjectPath(reading.electricity_image_url, 'meter-photos'),
    }] as const
  }))
  const activeTenants = new Map((contractsResult.data ?? []).map((contract) => [contract.room_id, tenantName(contract.tenants as TenantJoin)]))
  const billedTenants = new Map((billsResult.data ?? []).map((bill) => [bill.room_id, tenantName(bill.tenants as TenantJoin)]))
  // Include saved historical readings even when that room's contract is no longer active.
  const rooms = (roomsResult.data ?? [])
    .filter((room) => readings.has(room.id) || activeTenants.has(room.id))
    .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), 'th', { numeric: true }))
  const savedCount = rooms.filter((room) => readings.has(room.id)).length
  const missingPhotos = rooms.filter((room) => {
    const reading = readings.get(room.id)
    return reading && (!reading.water_image_path || !reading.electricity_image_path)
  }).length

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-3 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/bills/meter?month=${currentMonth}`} className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <ChevronLeft className="size-4" /> กลับหน้าจดมิเตอร์
          </Link>
          <p className="mb-1 text-xs font-semibold text-slate-400">ประจำเดือน {monthLabel}</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950 md:text-3xl"><ScanEye className="size-6" /> ตรวจทานมิเตอร์</h1>
        </div>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="review-month" className="sr-only">เดือนที่ต้องการตรวจทาน</label>
          <input id="review-month" type="month" name="month" defaultValue={currentMonth} required className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700" />
          <button type="submit" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">ดู</button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>เทียบเลขตัวใหญ่กับเลขในรูป แล้วเลื่อนลงดูห้องถัดไปได้เลย</p>
        <p className="mt-1 text-xs text-slate-400">แสดงเฉพาะข้อมูลที่บันทึกแล้ว ไม่รวมตัวเลขหรือรูปที่ยังไม่ได้กดบันทึก หน้านี้ไม่มีการแก้ไขบิล</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold">
          <span>บันทึกแล้ว {savedCount}/{rooms.length} ห้อง</span>
          {missingPhotos > 0 && <span className="text-amber-600">รูปยังไม่ครบ {missingPhotos} ห้อง</span>}
        </div>
      </div>

      {rooms.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">ยังไม่มีข้อมูลห้องสำหรับตรวจทานในเดือนนี้</p>}

      {rooms.map((room) => {
        const reading = readings.get(room.id)
        const name = billedTenants.get(room.id) ?? activeTenants.get(room.id)
        return (
          <article key={room.id} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-3 md:p-5">
            <header className="flex flex-wrap items-center justify-between gap-2 px-1 py-2">
              <div>
                <h2 className="text-xl font-bold text-slate-950 md:text-2xl">ห้อง {room.room_number} <span className="text-sm font-normal text-slate-400">แถวที่ {roomRow(room.room_number)}</span></h2>
                {name && <p className="mt-1 text-sm text-slate-500">{name}</p>}
              </div>
              {!reading && <p className="flex items-center gap-1 text-xs font-semibold text-amber-600"><AlertCircle className="size-4" /> ยังไม่ได้บันทึกมิเตอร์เดือนนี้</p>}
            </header>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <MeterPanel type="water" roomNumber={room.room_number} previous={reading?.water_prev} current={reading?.water_curr} imageUrl={reading?.water_image_url} storedValue={reading?.water_image_path} />
              <MeterPanel type="electricity" roomNumber={room.room_number} previous={reading?.electricity_prev} current={reading?.electricity_curr} imageUrl={reading?.electricity_image_url} storedValue={reading?.electricity_image_path} />
            </div>
          </article>
        )
      })}
    </div>
  )
}
