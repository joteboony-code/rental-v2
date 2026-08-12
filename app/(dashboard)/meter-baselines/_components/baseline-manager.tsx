'use client'

import { FormEvent, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Camera, CheckCircle2, Droplets, Gauge, Loader2, RotateCcw, Zap } from 'lucide-react'
import { cancelMeterBaseline, setMeterBaseline, type MeterBaselineActionState } from '@/app/actions/meter-baselines'
import { METER_BASELINE_REASONS, type MeterBaselineReason } from '@/lib/meter-baseline'

export type BaselineRoom = {
  id: string
  roomNumber: string
  floor: number | null
  tenantName: string
  previousWater: number
  previousElectricity: number
  billStatus: string | null
  activeAdjustment: {
    id: string
    waterBaseline: number
    electricityBaseline: number
    reasonCode: MeterBaselineReason
    reasonNote: string | null
    waterImageUrl: string | null
    electricityImageUrl: string | null
    createdAt: string
  } | null
}

export type BaselineHistoryItem = {
  id: string
  roomId: string
  roomNumber: string
  billingMonth: string
  previousWater: number
  previousElectricity: number
  waterBaseline: number
  electricityBaseline: number
  reasonCode: MeterBaselineReason
  reasonNote: string | null
  waterImageUrl: string | null
  electricityImageUrl: string | null
  createdAt: string
  cancelledAt: string | null
  cancellationNote: string | null
  billCreated: boolean
}

async function compressImage(file: File, maxPx = 1400, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg',
        quality
      )
    }
    image.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    image.src = url
  })
}

const numberFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })
const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })

export function BaselineManager({
  rooms,
  history,
  billingMonth,
  setupError,
}: {
  rooms: BaselineRoom[]
  history: BaselineHistoryItem[]
  billingMonth: string
  setupError: string | null
}) {
  const router = useRouter()
  const initialRoom = rooms[0]
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoom?.id ?? '')
  const [waterBaseline, setWaterBaseline] = useState(String(initialRoom?.activeAdjustment?.waterBaseline ?? initialRoom?.previousWater ?? ''))
  const [electricityBaseline, setElectricityBaseline] = useState(String(initialRoom?.activeAdjustment?.electricityBaseline ?? initialRoom?.previousElectricity ?? ''))
  const [reasonCode, setReasonCode] = useState<MeterBaselineReason>(initialRoom?.activeAdjustment?.reasonCode ?? 'repair')
  const [reasonNote, setReasonNote] = useState(initialRoom?.activeAdjustment?.reasonNote ?? '')
  const [result, setResult] = useState<MeterBaselineActionState>()
  const [pending, startTransition] = useTransition()
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0], [rooms, selectedRoomId])

  function selectRoom(roomId: string) {
    const room = rooms.find((item) => item.id === roomId)
    setSelectedRoomId(roomId)
    if (room) {
      setWaterBaseline(String(room.activeAdjustment?.waterBaseline ?? room.previousWater))
      setElectricityBaseline(String(room.activeAdjustment?.electricityBaseline ?? room.previousElectricity))
      setReasonCode(room.activeAdjustment?.reasonCode ?? 'repair')
      setReasonNote(room.activeAdjustment?.reasonNote ?? '')
    }
    setResult(undefined)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    for (const name of ['water_image', 'electricity_image'] as const) {
      const file = formData.get(name)
      if (file instanceof File && file.size > 0) formData.set(name, await compressImage(file))
    }
    startTransition(async () => {
      const response = await setMeterBaseline(undefined, formData)
      setResult(response)
      if (response?.success) router.refresh()
    })
  }

  function handleCancel(adjustmentId: string) {
    if (!window.confirm('ยืนยันยกเลิกการปรับฐานรายการนี้?')) return
    startTransition(async () => {
      const response = await cancelMeterBaseline(adjustmentId)
      setResult(response)
      if (response.success) {
        if (selectedRoom?.activeAdjustment?.id === adjustmentId) {
          setWaterBaseline(String(selectedRoom.previousWater))
          setElectricityBaseline(String(selectedRoom.previousElectricity))
          setReasonCode('repair')
          setReasonNote('')
        }
        router.refresh()
      }
    })
  }

  const locked = !!selectedRoom?.billStatus

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <Gauge className="size-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900">ตั้งเลขเริ่มต้นรอบใหม่</h2>
        </div>

        {setupError && <Message success={false} message={setupError} />}
        {result?.message && <Message success={!!result.success} message={result.message} />}

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          <input type="hidden" name="billing_month" value={billingMonth} />
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            ห้อง
            <select name="room_id" value={selectedRoom?.id ?? ''} onChange={(event) => selectRoom(event.target.value)} required className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-900">
              {rooms.map((room) => <option key={room.id} value={room.id}>ห้อง {room.roomNumber} · {room.tenantName}</option>)}
            </select>
          </label>

          {selectedRoom && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <BaselineMetric icon={Droplets} label="ฐานเดิมน้ำ" value={selectedRoom.previousWater} tone="water" />
                <BaselineMetric icon={Zap} label="ฐานเดิมไฟ" value={selectedRoom.previousElectricity} tone="electricity" />
              </div>

              {locked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  ห้องนี้ออกบิลรอบดังกล่าวแล้ว ({selectedRoom.billStatus}) จึงล็อกการปรับฐาน
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  เลขตั้งต้นน้ำใหม่
                  <input name="water_baseline" type="number" min="0" step="0.01" value={waterBaseline} onChange={(event) => setWaterBaseline(event.target.value)} required disabled={locked || !!setupError} className="h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-slate-700">
                  เลขตั้งต้นไฟใหม่
                  <input name="electricity_baseline" type="number" min="0" step="0.01" value={electricityBaseline} onChange={(event) => setElectricityBaseline(event.target.value)} required disabled={locked || !!setupError} className="h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100" />
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                เหตุผล
                <select name="reason_code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value as MeterBaselineReason)} disabled={locked || !!setupError} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100">
                  {Object.entries(METER_BASELINE_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                รายละเอียดเพิ่มเติม {reasonCode === 'other' && <span className="text-rose-500">*</span>}
                <textarea name="reason_note" maxLength={500} value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} required={reasonCode === 'other'} disabled={locked || !!setupError} placeholder="เช่น ช่างใช้ไฟและน้ำระหว่างซ่อมห้อง 3 วัน" className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100" />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PhotoField key={`${selectedRoom.id}-${selectedRoom.activeAdjustment?.id ?? 'new'}-water`} name="water_image" label="รูปมิเตอร์น้ำ (ถ้ามี)" disabled={locked || !!setupError} />
                <PhotoField key={`${selectedRoom.id}-${selectedRoom.activeAdjustment?.id ?? 'new'}-electricity`} name="electricity_image" label="รูปมิเตอร์ไฟ (ถ้ามี)" disabled={locked || !!setupError} />
              </div>

              <button type="submit" disabled={pending || locked || !!setupError || rooms.length === 0} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {selectedRoom.activeAdjustment ? 'บันทึกการแก้ไขฐาน' : 'บันทึกเลขตั้งต้นใหม่'}
              </button>
            </>
          )}
        </form>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-900">ประวัติการปรับฐาน</h2>
        {history.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">ยังไม่มีประวัติการปรับฐานมิเตอร์</div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => {
              const active = !item.cancelledAt
              return (
                <article key={item.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">ห้อง {item.roomNumber} · {item.billingMonth.slice(0, 7)}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{dateFmt.format(new Date(item.createdAt))}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{active ? 'ใช้งาน' : 'ยกเลิกแล้ว'}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <p className="rounded-lg bg-blue-50 p-2 text-blue-700">น้ำ {numberFmt.format(item.previousWater)} → <strong>{numberFmt.format(item.waterBaseline)}</strong></p>
                    <p className="rounded-lg bg-amber-50 p-2 text-amber-700">ไฟ {numberFmt.format(item.previousElectricity)} → <strong>{numberFmt.format(item.electricityBaseline)}</strong></p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{METER_BASELINE_REASONS[item.reasonCode]}{item.reasonNote ? ` · ${item.reasonNote}` : ''}</p>
                  {(item.waterImageUrl || item.electricityImageUrl) && (
                    <div className="mt-2 flex gap-3 text-xs font-medium text-slate-500">
                      {item.waterImageUrl && <a href={item.waterImageUrl} target="_blank" rel="noreferrer" className="hover:underline">ดูรูปน้ำ</a>}
                      {item.electricityImageUrl && <a href={item.electricityImageUrl} target="_blank" rel="noreferrer" className="hover:underline">ดูรูปไฟ</a>}
                    </div>
                  )}
                  {active && !item.billCreated && (
                    <button type="button" onClick={() => handleCancel(item.id)} disabled={pending} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50">
                      <RotateCcw className="size-3" /> ยกเลิกการปรับฐาน
                    </button>
                  )}
                  {active && item.billCreated && <p className="mt-3 text-xs text-slate-400">ใช้กับบิลแล้ว ไม่สามารถยกเลิกได้</p>}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function BaselineMetric({ icon: Icon, label, value, tone }: { icon: typeof Droplets; label: string; value: number; tone: 'water' | 'electricity' }) {
  const classes = tone === 'water' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
  return <div className={`rounded-xl p-3 ${classes}`}><p className="flex items-center gap-1 text-xs"><Icon className="size-3.5" /> {label}</p><p className="mt-1 text-lg font-bold">{numberFmt.format(value)}</p></div>
}

function PhotoField({ name, label, disabled }: { name: string; label: string; disabled: boolean }) {
  const [fileName, setFileName] = useState('')
  return (
    <label className={`flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
      <Camera className="size-4" />
      <span className="min-w-0 flex-1 truncate">{fileName || label}</span>
      <input name={name} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')} className="sr-only" />
    </label>
  )
}

function Message({ success, message }: { success: boolean; message: string }) {
  return <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${success ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{success ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}{message}</div>
}
