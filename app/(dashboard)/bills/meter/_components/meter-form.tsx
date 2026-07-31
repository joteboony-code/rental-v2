'use client'

import { useRef, useState, useTransition } from 'react'
import { saveMeterAndGenerateBills } from '@/app/actions/bills'
import { readMeterOCR } from '@/app/actions/ocr'
import { Input } from '@/components/ui/input'
import { Loader2, Zap, Droplets, Check, AlertCircle, AlertTriangle, CalendarDays, Camera, X, ListChecks, ScanLine } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'

export interface RoomRow {
  room_id:             string
  room_number:         string
  floor:               number | null
  tenant_name:         string
  contract_id:         string
  tenant_id:           string
  rent:                number
  water_prev:          number
  electricity_prev:    number
  water_curr:          number
  electricity_curr:    number
  water_image_url:     string | null
  electricity_image_url: string | null
  // Anomaly detection
  prev_water_units:  number | null
  prev_elec_units:   number | null
  // Pro-rated rent
  start_date:        string
  is_first_month:    boolean
}

interface Props {
  rooms:              RoomRow[]
  billingMonth:       string
  waterRate:          number
  electricityRate:    number
  anomalyThreshold:   number   // % increase to flag
  ocrEnabled:          boolean
}

/** Pro-rated rent — ต้องตรงกับฝั่ง server (app/actions/bills.ts):
 *  หารด้วยจำนวนวันจริงของเดือน และคิดตามวันเฉพาะเมื่อเข้าอยู่หลังวันที่ 1 */
function calcProRated(rent: number, startDate: string, billingMonth: string): { days: number; amount: number } {
  const [year, month] = billingMonth.split('-').map(Number)
  const startDay      = parseInt(startDate.split('-')[2])
  const daysInMonth   = new Date(year, month, 0).getDate()
  const days          = daysInMonth - startDay + 1
  const amount        = startDay > 1 ? Math.round(rent * days / daysInMonth) : rent
  return { days, amount }
}

// ย่อรูปก่อนส่ง — กล้องมือถือให้ ~5MB แต่ต้องการแค่ ~300KB
async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
        'image/jpeg', quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

type SaveStatus = 'idle' | 'loading' | 'saved' | 'error'
type PhotoSlot = { file: File | null; preview: string | null; existing: string | null }
type RoomPhotos = { water: PhotoSlot; elec: PhotoSlot }
type OcrSlotState = 'idle' | 'reading' | 'done' | 'failed'
type RoomOcrState = { water: OcrSlotState; elec: OcrSlotState }

export function MeterForm({ rooms, billingMonth, waterRate, electricityRate, anomalyThreshold, ocrEnabled }: Props) {
  const [, startTransition] = useTransition()
  const fileRefs = useRef<Record<string, { water: HTMLInputElement | null; elec: HTMLInputElement | null }>>({})

  // Per-room input values
  const [curr, setCurr] = useState<Record<string, { water: string; elec: string }>>(() => {
    const init: Record<string, { water: string; elec: string }> = {}
    rooms.forEach((r) => {
      init[r.room_id] = {
        water: r.water_curr > 0 ? String(r.water_curr) : '',
        elec:  r.electricity_curr > 0 ? String(r.electricity_curr) : '',
      }
    })
    return init
  })

  // Per-room photos
  const [photos, setPhotos] = useState<Record<string, RoomPhotos>>(() => {
    const init: Record<string, RoomPhotos> = {}
    rooms.forEach((r) => {
      init[r.room_id] = {
        water: { file: null, preview: null, existing: r.water_image_url ?? null },
        elec:  { file: null, preview: null, existing: r.electricity_image_url ?? null },
      }
    })
    return init
  })

  async function handlePhoto(roomId: string, slot: 'water' | 'elec', file: File | null) {
    if (!file) return
    const compressed = await compressImage(file, 1200, 0.82)
    const preview = URL.createObjectURL(compressed)
    setPhotos(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], [slot]: { file: compressed, preview, existing: prev[roomId]?.[slot]?.existing ?? null } },
    }))

    // เก็บรูปหลักฐานได้เสมอ แต่เรียก OCR เฉพาะเมื่อเปิดใช้งาน
    if (!ocrEnabled) return

    setOcrState(prev => ({
      ...prev,
      [roomId]: { ...(prev[roomId] ?? { water: 'idle', elec: 'idle' }), [slot]: 'reading' },
    }))
    const fd = new FormData()
    fd.append('image', compressed)
    const result = await readMeterOCR(fd)

    if (result.value !== null) {
      const currKey = slot === 'water' ? 'water' : 'elec'
      setCurr(prev => ({ ...prev, [roomId]: { ...prev[roomId], [currKey]: String(result.value) } }))
      if (saveStatus[roomId] === 'saved') setSaveStatus(prev => ({ ...prev, [roomId]: 'idle' }))
      setOcrState(prev => ({
        ...prev,
        [roomId]: { ...(prev[roomId] ?? { water: 'idle', elec: 'idle' }), [slot]: 'done' },
      }))
    } else {
      setOcrState(prev => ({
        ...prev,
        [roomId]: { ...(prev[roomId] ?? { water: 'idle', elec: 'idle' }), [slot]: 'failed' },
      }))
    }
  }

  function clearPhoto(roomId: string, slot: 'water' | 'elec') {
    setPhotos(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], [slot]: { file: null, preview: null, existing: null } },
    }))
    setOcrState(prev => ({
      ...prev,
      [roomId]: { ...(prev[roomId] ?? { water: 'idle', elec: 'idle' }), [slot]: 'idle' },
    }))
    const ref = fileRefs.current[roomId]?.[slot]
    if (ref) ref.value = ''
  }

  // Per-room save status — pre-mark rooms that already have this month's reading
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>(() => {
    const init: Record<string, SaveStatus> = {}
    rooms.forEach((r) => {
      init[r.room_id] = r.water_curr > 0 ? 'saved' : 'idle'
    })
    return init
  })

  const [ocrState, setOcrState] = useState<Record<string, RoomOcrState>>({})

  const [saveError, setSaveError] = useState<Record<string, string>>({})
  const [isSavingAll, setIsSavingAll] = useState(false)

  function calcRow(roomId: string, waterPrev: number, electricityPrev: number, rent: number) {
    const wCurr  = parseFloat(curr[roomId]?.water || '0') || 0
    const eCurr  = parseFloat(curr[roomId]?.elec  || '0') || 0
    const wUnits = Math.max(0, wCurr - waterPrev)
    const eUnits = Math.max(0, eCurr - electricityPrev)
    return {
      wUnits, eUnits,
      wAmt:  wUnits * waterRate,
      eAmt:  eUnits * electricityRate,
      total: rent + wUnits * waterRate + eUnits * electricityRate,
    }
  }

  async function doSaveRoom(room: RoomRow): Promise<boolean> {
    const wCurrVal = parseFloat(curr[room.room_id]?.water || '0') || 0
    const eCurrVal = parseFloat(curr[room.room_id]?.elec  || '0') || 0

    if (!curr[room.room_id]?.water || !curr[room.room_id]?.elec) {
      setSaveError(prev => ({ ...prev, [room.room_id]: 'กรุณากรอกค่ามิเตอร์น้ำและไฟ' }))
      return false
    }
    if (wCurrVal < room.water_prev) {
      setSaveError(prev => ({ ...prev, [room.room_id]: 'มิเตอร์น้ำต้องมากกว่าค่าก่อนหน้า' }))
      return false
    }
    if (eCurrVal < room.electricity_prev) {
      setSaveError(prev => ({ ...prev, [room.room_id]: 'มิเตอร์ไฟต้องมากกว่าค่าก่อนหน้า' }))
      return false
    }

    setSaveStatus(prev => ({ ...prev, [room.room_id]: 'loading' }))
    setSaveError(prev => ({ ...prev, [room.room_id]: '' }))

    const fd = new FormData()
    fd.append('billing_month', billingMonth)
    fd.append('room_ids', room.room_id)
    fd.append(`room_${room.room_id}_contract_id`,       room.contract_id)
    fd.append(`room_${room.room_id}_tenant_id`,          room.tenant_id)
    fd.append(`room_${room.room_id}_rent`,               String(room.rent))
    fd.append(`room_${room.room_id}_water_prev`,         String(room.water_prev))
    fd.append(`room_${room.room_id}_water_curr`,         String(wCurrVal))
    fd.append(`room_${room.room_id}_electricity_prev`,   String(room.electricity_prev))
    fd.append(`room_${room.room_id}_electricity_curr`,   String(eCurrVal))
    fd.append(`room_${room.room_id}_start_date`,          room.start_date)

    const roomPhotos = photos[room.room_id]
    if (roomPhotos?.water.file)  fd.append(`room_${room.room_id}_water_image`, roomPhotos.water.file)
    if (roomPhotos?.elec.file)   fd.append(`room_${room.room_id}_elec_image`,  roomPhotos.elec.file)

    const res = await saveMeterAndGenerateBills(fd)
    setSaveStatus(prev => ({ ...prev, [room.room_id]: res.success ? 'saved' : 'error' }))
    if (!res.success) setSaveError(prev => ({ ...prev, [room.room_id]: res.message }))
    return res.success
  }

  function saveRoom(room: RoomRow) {
    startTransition(async () => { await doSaveRoom(room) })
  }

  async function saveAllRooms() {
    const pending = rooms.filter((r) =>
      saveStatus[r.room_id] !== 'saved' &&
      saveStatus[r.room_id] !== 'loading' &&
      !!(curr[r.room_id]?.water && curr[r.room_id]?.elec)
    )
    if (pending.length === 0) return
    setIsSavingAll(true)
    for (const room of pending) {
      await doSaveRoom(room)
    }
    setIsSavingAll(false)
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">ไม่มีห้องที่มีสัญญาเช่าในขณะนี้</p>
      </div>
    )
  }

  const savedCount = Object.values(saveStatus).filter(s => s === 'saved').length
  const pendingWithDataCount = rooms.filter((r) =>
    saveStatus[r.room_id] !== 'saved' &&
    saveStatus[r.room_id] !== 'loading' &&
    !!(curr[r.room_id]?.water && curr[r.room_id]?.elec)
  ).length

  return (
    <div>
      {/* Progress bar */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${rooms.length > 0 ? (savedCount / rooms.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">
          {savedCount}/{rooms.length} ห้อง
        </span>
        {pendingWithDataCount > 0 && (
          <button
            type="button"
            onClick={saveAllRooms}
            disabled={isSavingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-all shrink-0"
          >
            {isSavingAll ? (
              <><Loader2 className="size-3 animate-spin" /> กำลังบันทึก...</>
            ) : (
              <><ListChecks className="size-3.5" /> บันทึกทั้งหมด ({pendingWithDataCount})</>
            )}
          </button>
        )}
      </div>

      {/* ── Mobile: Cards ── */}
      <div className="md:hidden grid grid-cols-1 gap-3 p-3">
        {rooms.map((room) => {
          const { wUnits, eUnits, wAmt, eAmt, total } = calcRow(room.room_id, room.water_prev, room.electricity_prev, room.rent)
          const status    = saveStatus[room.room_id] ?? 'idle'
          const error     = saveError[room.room_id]
          const wAnomaly  = room.prev_water_units !== null && room.prev_water_units > 0
                          && wUnits > room.prev_water_units * (1 + anomalyThreshold / 100)
          const eAnomaly  = room.prev_elec_units !== null && room.prev_elec_units > 0
                          && eUnits > room.prev_elec_units * (1 + anomalyThreshold / 100)
          const proRated  = room.is_first_month && room.start_date
                          ? calcProRated(room.rent, room.start_date, billingMonth) : null
          return (
            <div key={room.room_id} className={`group flex flex-col rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${status === 'saved' ? 'border-emerald-200 shadow-emerald-50' : 'border-slate-200 hover:shadow-md hover:border-slate-300'}`}>
              <div className={`h-1 w-full ${status === 'saved' ? 'bg-emerald-500' : status === 'error' ? 'bg-rose-500' : 'bg-teal-400'}`} />
              <div className={`p-4 ${status === 'saved' ? 'bg-emerald-50/30' : ''}`}>

              {/* Room header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`size-10 rounded-xl flex items-center justify-center font-bold text-sm transition-colors ${
                    status === 'saved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {room.room_number}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{room.tenant_name}</p>
                    <p className="text-xs text-slate-400">แถวที่ {roomRow(room.room_number)}</p>
                    {proRated && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md mt-0.5">
                        <CalendarDays className="size-3" /> เช่าตามวัน ({proRated.days}วัน)
                      </span>
                    )}
                  </div>
                </div>
                {status === 'saved' && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    <Check className="size-3.5" /> บันทึกแล้ว
                  </span>
                )}
                {status === 'error' && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-rose-500">
                    <AlertCircle className="size-3.5" /> ผิดพลาด
                  </span>
                )}
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Water */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-xs font-semibold text-blue-500">
                    <Droplets className="size-3.5" /> น้ำ
                  </div>
                  <p className="text-xs text-slate-400">ก่อนหน้า: <strong className="text-slate-600">{room.water_prev.toLocaleString()}</strong></p>
                  <Input
                    type="number"
                    value={curr[room.room_id]?.water ?? ''}
                    onChange={(e) => {
                      setCurr(prev => ({ ...prev, [room.room_id]: { ...prev[room.room_id], water: e.target.value } }))
                      if (saveStatus[room.room_id] === 'saved') setSaveStatus(prev => ({ ...prev, [room.room_id]: 'idle' }))
                    }}
                    className="h-9 text-sm"
                    min={room.water_prev}
                    step="0.01"
                    placeholder={String(room.water_prev)}
                  />
                  {wUnits > 0 && (
                    <div>
                      <p className="text-xs text-blue-600 font-medium">
                        {wUnits.toFixed(1)} หน่วย · ฿{wAmt.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                      </p>
                      {wAnomaly && room.prev_water_units !== null && (
                        <p className="flex items-center gap-0.5 text-xs text-rose-600 font-bold mt-0.5">
                          <AlertTriangle className="size-3" /> น้ำสูงผิดปกติ +{Math.round((wUnits / room.prev_water_units - 1) * 100)}%
                        </p>
                      )}
                    </div>
                  )}
                  <PhotoPicker
                    slot={photos[room.room_id]?.water}
                    accentClass="border-blue-200 text-blue-500 hover:bg-blue-50"
                    inputRef={(el) => {
                      if (!fileRefs.current[room.room_id]) fileRefs.current[room.room_id] = { water: null, elec: null }
                      fileRefs.current[room.room_id].water = el
                    }}
                    onChange={(f) => handlePhoto(room.room_id, 'water', f)}
                    onClear={() => clearPhoto(room.room_id, 'water')}
                  />
                  <OcrBadge state={ocrState[room.room_id]?.water} />
                </div>

                {/* Electricity */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-xs font-semibold text-amber-500">
                    <Zap className="size-3.5" /> ไฟ
                  </div>
                  <p className="text-xs text-slate-400">ก่อนหน้า: <strong className="text-slate-600">{room.electricity_prev.toLocaleString()}</strong></p>
                  <Input
                    type="number"
                    value={curr[room.room_id]?.elec ?? ''}
                    onChange={(e) => {
                      setCurr(prev => ({ ...prev, [room.room_id]: { ...prev[room.room_id], elec: e.target.value } }))
                      if (saveStatus[room.room_id] === 'saved') setSaveStatus(prev => ({ ...prev, [room.room_id]: 'idle' }))
                    }}
                    className="h-9 text-sm"
                    min={room.electricity_prev}
                    step="0.01"
                    placeholder={String(room.electricity_prev)}
                  />
                  {eUnits > 0 && (
                    <div>
                      <p className="text-xs text-amber-600 font-medium">
                        {eUnits.toFixed(1)} หน่วย · ฿{eAmt.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                      </p>
                      {eAnomaly && room.prev_elec_units !== null && (
                        <p className="flex items-center gap-0.5 text-xs text-rose-600 font-bold mt-0.5">
                          <AlertTriangle className="size-3" /> ไฟสูงผิดปกติ +{Math.round((eUnits / room.prev_elec_units - 1) * 100)}%
                        </p>
                      )}
                    </div>
                  )}
                  <PhotoPicker
                    slot={photos[room.room_id]?.elec}
                    accentClass="border-amber-200 text-amber-500 hover:bg-amber-50"
                    inputRef={(el) => {
                      if (!fileRefs.current[room.room_id]) fileRefs.current[room.room_id] = { water: null, elec: null }
                      fileRefs.current[room.room_id].elec = el
                    }}
                    onChange={(f) => handlePhoto(room.room_id, 'elec', f)}
                    onClear={() => clearPhoto(room.room_id, 'elec')}
                  />
                  <OcrBadge state={ocrState[room.room_id]?.elec} />
                </div>
              </div>

              {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}

              {/* Total + Save button */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-400">รวม</p>
                  <p className="text-lg font-bold text-slate-950 tracking-tight">฿{total.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  {proRated ? (
                    <p className="text-xs text-violet-600 font-medium">ค่าเช่าตามวัน ฿{proRated.amount.toLocaleString()}</p>
                  ) : (
                    <p className="text-xs text-slate-400">ค่าเช่า ฿{room.rent.toLocaleString()}</p>
                  )}
                </div>
                <SaveButton status={status} onClick={() => saveRoom(room)} />
              </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: Table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">ห้อง</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">ผู้เช่า</th>
              <th colSpan={3} className="text-center px-3 py-3.5 text-xs font-semibold text-blue-400 uppercase tracking-widest border-l border-slate-100">
                <span className="flex items-center justify-center gap-1"><Droplets className="size-3.5" /> น้ำ ({waterRate} บ./หน่วย)</span>
              </th>
              <th colSpan={3} className="text-center px-3 py-3.5 text-xs font-semibold text-amber-400 uppercase tracking-widest border-l border-slate-100">
                <span className="flex items-center justify-center gap-1"><Zap className="size-3.5" /> ไฟ ({electricityRate} บ./หน่วย)</span>
              </th>
              <th className="text-right px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-widest border-l border-slate-100">รวม</th>
              <th className="px-4 py-3.5 w-28"></th>
            </tr>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th /><th />
              <th className="px-3 py-2 text-center font-normal border-l border-slate-100">ก่อนหน้า</th>
              <th className="px-3 py-2 text-center font-normal">จดใหม่</th>
              <th className="px-3 py-2 text-center font-normal">หน่วย / บาท</th>
              <th className="px-3 py-2 text-center font-normal border-l border-slate-100">ก่อนหน้า</th>
              <th className="px-3 py-2 text-center font-normal">จดใหม่</th>
              <th className="px-3 py-2 text-center font-normal">หน่วย / บาท</th>
              <th /><th />
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const { wUnits, eUnits, wAmt, eAmt, total } = calcRow(room.room_id, room.water_prev, room.electricity_prev, room.rent)
              const status     = saveStatus[room.room_id] ?? 'idle'
              const error      = saveError[room.room_id]
              // Anomaly detection
              const wAnomaly   = room.prev_water_units !== null && room.prev_water_units > 0
                               && wUnits > room.prev_water_units * (1 + anomalyThreshold / 100)
              const eAnomaly   = room.prev_elec_units !== null && room.prev_elec_units > 0
                               && eUnits > room.prev_elec_units * (1 + anomalyThreshold / 100)
              // Pro-rated rent (first month)
              const proRated   = room.is_first_month && room.start_date
                               ? calcProRated(room.rent, room.start_date, billingMonth)
                               : null
              return (
                <tr key={room.room_id} className={`border-b border-slate-50 last:border-0 transition-colors ${
                  status === 'saved' ? 'bg-emerald-50/30' : 'hover:bg-slate-50/60'
                }`}>
                  <td className="px-5 py-3">
                    <div className={`size-9 rounded-xl flex items-center justify-center text-xs font-bold transition-colors ${
                      status === 'saved' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {room.room_number}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-700">{room.tenant_name}</p>
                    <p className="text-xs text-slate-400">แถวที่ {roomRow(room.room_number)}</p>
                  </td>

                  {/* Water prev */}
                  <td className="px-3 py-3 text-center text-slate-500 border-l border-slate-100">
                    {room.water_prev.toLocaleString()}
                  </td>
                  {/* Water curr input */}
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={curr[room.room_id]?.water ?? ''}
                      onChange={(e) => {
                        setCurr(prev => ({ ...prev, [room.room_id]: { ...prev[room.room_id], water: e.target.value } }))
                        if (saveStatus[room.room_id] === 'saved') setSaveStatus(prev => ({ ...prev, [room.room_id]: 'idle' }))
                      }}
                      className="w-24 text-center h-8 text-sm"
                      min={room.water_prev}
                      step="0.01"
                      placeholder={String(room.water_prev)}
                    />
                    <PhotoPicker
                      slot={photos[room.room_id]?.water}
                      accentClass="border-blue-200 text-blue-500 hover:bg-blue-50"
                      compact
                      inputRef={(el) => {
                        if (!fileRefs.current[room.room_id]) fileRefs.current[room.room_id] = { water: null, elec: null }
                        fileRefs.current[room.room_id].water = el
                      }}
                      onChange={(f) => handlePhoto(room.room_id, 'water', f)}
                      onClear={() => clearPhoto(room.room_id, 'water')}
                    />
                    <OcrBadge state={ocrState[room.room_id]?.water} compact />
                  </td>
                  {/* Water calc + anomaly */}
                  <td className="px-3 py-3 text-center">
                    {wUnits > 0 ? (
                      <>
                        <div className="text-blue-600 font-medium text-xs">{wUnits.toFixed(1)} หน่วย</div>
                        <div className="text-blue-700 text-xs font-semibold">฿{wAmt.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
                        {wAnomaly && room.prev_water_units !== null && (
                          <div className="flex items-center justify-center gap-0.5 text-rose-600 text-xs font-bold mt-0.5">
                            <AlertTriangle className="size-3" />
                            +{Math.round((wUnits / room.prev_water_units - 1) * 100)}%
                          </div>
                        )}
                      </>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>

                  {/* Electricity prev */}
                  <td className="px-3 py-3 text-center text-slate-500 border-l border-slate-100">
                    {room.electricity_prev.toLocaleString()}
                  </td>
                  {/* Electricity curr input */}
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={curr[room.room_id]?.elec ?? ''}
                      onChange={(e) => {
                        setCurr(prev => ({ ...prev, [room.room_id]: { ...prev[room.room_id], elec: e.target.value } }))
                        if (saveStatus[room.room_id] === 'saved') setSaveStatus(prev => ({ ...prev, [room.room_id]: 'idle' }))
                      }}
                      className="w-24 text-center h-8 text-sm"
                      min={room.electricity_prev}
                      step="0.01"
                      placeholder={String(room.electricity_prev)}
                    />
                    <PhotoPicker
                      slot={photos[room.room_id]?.elec}
                      accentClass="border-amber-200 text-amber-500 hover:bg-amber-50"
                      compact
                      inputRef={(el) => {
                        if (!fileRefs.current[room.room_id]) fileRefs.current[room.room_id] = { water: null, elec: null }
                        fileRefs.current[room.room_id].elec = el
                      }}
                      onChange={(f) => handlePhoto(room.room_id, 'elec', f)}
                      onClear={() => clearPhoto(room.room_id, 'elec')}
                    />
                    <OcrBadge state={ocrState[room.room_id]?.elec} compact />
                  </td>
                  {/* Electricity calc + anomaly */}
                  <td className="px-3 py-3 text-center">
                    {eUnits > 0 ? (
                      <>
                        <div className="text-amber-600 font-medium text-xs">{eUnits.toFixed(1)} หน่วย</div>
                        <div className="text-amber-700 text-xs font-semibold">฿{eAmt.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
                        {eAnomaly && room.prev_elec_units !== null && (
                          <div className="flex items-center justify-center gap-0.5 text-rose-600 text-xs font-bold mt-0.5">
                            <AlertTriangle className="size-3" />
                            +{Math.round((eUnits / room.prev_elec_units - 1) * 100)}%
                          </div>
                        )}
                      </>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>

                  {/* Total + pro-rated */}
                  <td className="px-4 py-3 text-right border-l border-slate-100">
                    <div className="font-bold text-slate-950">฿{total.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
                    {proRated ? (
                      <div className="flex items-center justify-end gap-1 text-xs text-violet-600 font-medium mt-0.5">
                        <CalendarDays className="size-3" />
                        ค่าเช่า ฿{proRated.amount.toLocaleString()} ({proRated.days}วัน)
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">ค่าเช่า ฿{room.rent.toLocaleString()}</div>
                    )}
                    {error && <div className="text-xs text-rose-500 mt-0.5">{error}</div>}
                  </td>

                  {/* Save button */}
                  <td className="px-4 py-3 text-right">
                    <SaveButton status={status} onClick={() => saveRoom(room)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-100 bg-slate-50/60">
              <td colSpan={9} className="px-5 py-3 text-sm font-semibold text-slate-500 text-right">
                รวมทั้งหมด {rooms.length} ห้อง
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-950">
                ฿{rooms.reduce((sum, r) => sum + calcRow(r.room_id, r.water_prev, r.electricity_prev, r.rent).total, 0)
                    .toLocaleString('th-TH', { maximumFractionDigits: 0 })}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── OcrBadge component ───────────────────────────────────────
function OcrBadge({ state, compact = false }: { state: OcrSlotState | undefined; compact?: boolean }) {
  if (!state || state === 'idle') return null
  if (state === 'reading') return (
    <p className={`flex items-center gap-1 text-[10px] text-slate-400 ${compact ? '' : 'mt-1'}`}>
      <Loader2 className="size-3 animate-spin shrink-0" />
      {!compact && 'กำลังอ่าน...'}
    </p>
  )
  if (state === 'done') return (
    <p className={`flex items-center gap-1 text-[10px] text-emerald-600 font-semibold ${compact ? '' : 'mt-1'}`}>
      <ScanLine className="size-3 shrink-0" />
      {compact ? 'OCR' : 'อ่านค่าได้แล้ว'}
    </p>
  )
  return (
    <p className={`flex items-center gap-1 text-[10px] text-amber-500 ${compact ? '' : 'mt-1'}`}>
      <AlertCircle className="size-3 shrink-0" />
      {compact ? '?' : 'อ่านไม่ได้ กรอกเอง'}
    </p>
  )
}

// ── PhotoPicker component ─────────────────────────────────────
function PhotoPicker({
  slot, accentClass, compact = false, inputRef, onChange, onClear,
}: {
  slot: PhotoSlot | undefined
  accentClass: string
  compact?: boolean
  inputRef: (el: HTMLInputElement | null) => void
  onChange: (f: File) => void
  onClear: () => void
}) {
  const localRef = useRef<HTMLInputElement | null>(null)
  const preview  = slot?.preview ?? slot?.existing ?? null

  function combinedRef(el: HTMLInputElement | null) {
    localRef.current = el
    inputRef(el)
  }

  return (
    <div className="mt-1.5">
      {preview ? (
        <div className="relative inline-block">
          <a href={preview} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="มิเตอร์"
              className={`rounded-lg object-cover border border-slate-200 ${compact ? 'size-10' : 'h-20 w-full'}`}
            />
          </a>
          <button
            type="button"
            onClick={onClear}
            className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => localRef.current?.click()}
          aria-label="เพิ่มรูปมิเตอร์"
          title="เพิ่มรูปมิเตอร์"
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors ${accentClass}`}
        >
          <Camera className="size-3" />
          {!compact && 'เพิ่มรูปมิเตอร์'}
        </button>
      )}
      <input
        ref={combinedRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f) }}
      />
    </div>
  )
}

function SaveButton({ status, onClick }: { status: SaveStatus; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === 'loading'}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
        status === 'saved'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
          : status === 'error'
          ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
          : 'bg-slate-950 text-white hover:bg-slate-800 shadow-sm shadow-slate-900/20'
      }`}
    >
      {status === 'loading' ? (
        <><Loader2 className="size-3 animate-spin" /> บันทึก...</>
      ) : status === 'saved' ? (
        <><Check className="size-3" /> บันทึกแล้ว</>
      ) : status === 'error' ? (
        <><AlertCircle className="size-3" /> ลองใหม่</>
      ) : (
        'บันทึก'
      )}
    </button>
  )
}
