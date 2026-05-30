'use client'

import { useState, useTransition } from 'react'
import { saveMeterAndGenerateBills } from '@/app/actions/bills'
import { Input } from '@/components/ui/input'
import { Loader2, Zap, Droplets, Check, AlertCircle, AlertTriangle, CalendarDays } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'

export interface RoomRow {
  room_id:           string
  room_number:       string
  floor:             number | null
  tenant_name:       string
  contract_id:       string
  tenant_id:         string
  rent:              number
  water_prev:        number
  electricity_prev:  number
  water_curr:        number
  electricity_curr:  number
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
}

/** Pro-rated rent calculation: rent/30 × days occupied */
function calcProRated(rent: number, startDate: string, billingMonth: string): { days: number; amount: number } {
  const [year, month] = billingMonth.split('-').map(Number)
  const startDay      = parseInt(startDate.split('-')[2])
  const daysInMonth   = new Date(year, month, 0).getDate()
  const days          = daysInMonth - startDay + 1
  const amount        = Math.round(rent * days / 30)
  return { days, amount }
}

type SaveStatus = 'idle' | 'loading' | 'saved' | 'error'

export function MeterForm({ rooms, billingMonth, waterRate, electricityRate, anomalyThreshold }: Props) {
  const [, startTransition] = useTransition()

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

  // Per-room save status — pre-mark rooms that already have this month's reading
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>(() => {
    const init: Record<string, SaveStatus> = {}
    rooms.forEach((r) => {
      init[r.room_id] = r.water_curr > 0 ? 'saved' : 'idle'
    })
    return init
  })

  const [saveError, setSaveError] = useState<Record<string, string>>({})

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

  function saveRoom(room: RoomRow) {
    const wCurrVal = parseFloat(curr[room.room_id]?.water || '0') || 0
    const eCurrVal = parseFloat(curr[room.room_id]?.elec  || '0') || 0

    if (!curr[room.room_id]?.water || !curr[room.room_id]?.elec) {
      setSaveError(prev => ({ ...prev, [room.room_id]: 'กรุณากรอกค่ามิเตอร์น้ำและไฟ' }))
      return
    }
    if (wCurrVal < room.water_prev) {
      setSaveError(prev => ({ ...prev, [room.room_id]: 'มิเตอร์น้ำต้องมากกว่าค่าก่อนหน้า' }))
      return
    }
    if (eCurrVal < room.electricity_prev) {
      setSaveError(prev => ({ ...prev, [room.room_id]: 'มิเตอร์ไฟต้องมากกว่าค่าก่อนหน้า' }))
      return
    }

    setSaveStatus(prev => ({ ...prev, [room.room_id]: 'loading' }))
    setSaveError(prev => ({ ...prev, [room.room_id]: '' }))

    startTransition(async () => {
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

      const res = await saveMeterAndGenerateBills(fd)
      setSaveStatus(prev => ({ ...prev, [room.room_id]: res.success ? 'saved' : 'error' }))
      if (!res.success) setSaveError(prev => ({ ...prev, [room.room_id]: res.message }))
    })
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">ไม่มีห้องที่มีสัญญาเช่าในขณะนี้</p>
      </div>
    )
  }

  const savedCount = Object.values(saveStatus).filter(s => s === 'saved').length

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
      </div>

      {/* ── Mobile: Cards ── */}
      <div className="md:hidden divide-y divide-slate-100">
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
            <div key={room.room_id} className={`p-4 transition-colors ${status === 'saved' ? 'bg-emerald-50/40' : ''}`}>

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
