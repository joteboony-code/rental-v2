'use client'

import Script from 'next/script'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock,
  Droplets, ExternalLink, Home, Loader2, Receipt,
  Wallet, Wrench, Wifi, Trash2, Zap,
} from 'lucide-react'

const PromptPayQR = dynamic(
  () => import('@/app/(dashboard)/bills/[id]/_components/promptpay-qr').then((m) => m.PromptPayQR),
  { ssr: false }
)
import { getTenantPortalDashboard, getPortalRepairs, getPortalRooms, verifyAndGetPortalToken, type TenantPortalData, type PortalRepairItem, type PortalRoom } from '@/app/actions/portal'
import { getAdminPortalRepairs, getAdminPortalRooms, getAdminTenantPortalDashboard } from '@/app/actions/portal-admin'
import { roomRow } from '@/lib/room-utils'
import { isBillPayable } from '@/lib/billing'
import { Badge } from '@/components/ui/badge'
import { RepairSubmit } from './repair-submit'
import { RepairHistory } from './repair-history'
import type { LiffClient } from '@/lib/liff-types'

declare global { interface Window { liff?: LiffClient } }

type TenantPortalProps = {
  liffId?: string | null
  adminPreview?: boolean
  initialRoomId?: string
}
type Tab = 'bills' | 'repairs'

const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthFmt = new Intl.DateTimeFormat('th-TH', { year: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' })
const dateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })

const statusLabel: Record<string, string> = {
  paid: 'ชำระแล้ว', pending: 'รอชำระ', overdue: 'เกินกำหนด', cancelled: 'ยกเลิก',
}

export function TenantPortal({ liffId, adminPreview = false, initialRoomId }: TenantPortalProps) {
  const [scriptReady, setScriptReady]       = useState(false)
  const [linePictureUrl, setLinePictureUrl] = useState('')
  const [lineDisplayName, setLineDisplayName] = useState('')
  const [portalToken, setPortalToken]       = useState('')
  const [status, setStatus]                 = useState(adminPreview ? 'กำลังโหลดข้อมูล Portal' : liffId ? 'กำลังเชื่อมต่อ LINE' : 'กำลังเตรียมข้อมูลห้อง')
  const [data, setData]                     = useState<TenantPortalData | null>(null)
  const [error, setError]                   = useState(
    !adminPreview && !liffId ? 'ระบบยังไม่ได้ตั้งค่า LINE Portal กรุณาติดต่อผู้ดูแล' : ''
  )
  const [tab, setTab]                       = useState<Tab>('bills')
  const [repairs, setRepairs]               = useState<PortalRepairItem[] | null>(null)
  const [repairsLoading, setRepairsLoading] = useState(false)
  const [rooms, setRooms]                   = useState<PortalRoom[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined)
  const [authAttempt, setAuthAttempt]       = useState(0)
  const [, startTransition]                 = useTransition()
  const dashboardRequestId                  = useRef(0)
  const repairsRequestId                    = useRef(0)

  // The caller must pass the current token explicitly. Keeping portalToken out of
  // this callback's dependencies prevents a refreshed session token from
  // restarting the LIFF authentication effect on slower devices.
  const loadDashboard = useCallback((token: string, roomId?: string) => {
    if (!adminPreview && !token) return
    if (adminPreview && !roomId) return
    const requestId = ++dashboardRequestId.current
    setError('')
    setData(null)
    startTransition(async () => {
      try {
        const result = adminPreview
          ? await getAdminTenantPortalDashboard(roomId!)
          : await getTenantPortalDashboard(token, roomId)
        if (requestId !== dashboardRequestId.current) return
        if (!result.success) { setError(result.message); return }
        setData(result.data)
      } catch {
        if (requestId === dashboardRequestId.current) {
          setError('โหลดข้อมูล Portal ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        }
      }
    })
  }, [adminPreview])

  const loadRepairs = useCallback(async (token = portalToken, roomId = selectedRoomId) => {
    if (!adminPreview && !token) return
    if (adminPreview && !roomId) return
    const requestId = ++repairsRequestId.current
    setRepairsLoading(true)
    try {
      const result = adminPreview
        ? await getAdminPortalRepairs(roomId!)
        : await getPortalRepairs(token, roomId)
      if (requestId !== repairsRequestId.current) return
      if (result.success) setRepairs(result.repairs ?? [])
    } finally {
      if (requestId === repairsRequestId.current) setRepairsLoading(false)
    }
  }, [adminPreview, portalToken, selectedRoomId])

  useEffect(() => {
    if (!adminPreview) return
    let cancelled = false
    async function loadAdminPreview() {
      const result = await getAdminPortalRooms()
      if (cancelled) return
      if (!result.success) {
        setError(result.message ?? 'โหลดรายการห้องไม่สำเร็จ')
        return
      }
      setRooms(result.rooms)
      const selected = result.rooms.some((room) => room.room_id === initialRoomId)
        ? initialRoomId
        : result.rooms[0]?.room_id
      setSelectedRoomId(selected)
      if (selected) loadDashboard('', selected)
      else setError('ยังไม่มีห้องที่มีสัญญาเช่าใช้งานอยู่')
    }
    void loadAdminPreview()
    return () => { cancelled = true }
  }, [adminPreview, initialRoomId, loadDashboard])

  useEffect(() => {
    if (adminPreview || !liffId || !scriptReady) return
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setError('เชื่อมต่อ LINE ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง')
      }
    }, 15_000)
    async function loadLineProfile() {
      try {
        setError('')
        const liff = window.liff
        if (!liff) { setError('โหลด LINE SDK ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'); return }
        await liff.init({ liffId: liffId! })
        if (cancelled) return
        if (!liff.isLoggedIn()) { setStatus('กำลังเข้าสู่ระบบ LINE'); liff.login({ redirectUri: window.location.href }); return }
        const [profile, idToken] = await Promise.all([liff.getProfile(), Promise.resolve(liff.getIDToken())])
        if (cancelled) return
        setLinePictureUrl(profile.pictureUrl ?? '')
        setLineDisplayName(profile.displayName ?? '')
        setStatus('กำลังยืนยันตัวตน...')
        const tokenRes = await verifyAndGetPortalToken(idToken ?? '')
        if (cancelled) return
        if (!tokenRes.success) { setError(tokenRes.message); return }
        setPortalToken(tokenRes.token)
        setStatus('เชื่อมต่อ LINE แล้ว')
        const { rooms: activeRooms } = await getPortalRooms(tokenRes.token)
        setRooms(activeRooms)
        const firstRoomId = activeRooms[0]?.room_id
        setSelectedRoomId(firstRoomId)
        loadDashboard(tokenRes.token, firstRoomId)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('ยังดึงข้อมูลจาก LINE ไม่ได้ กรุณาลองใหม่อีกครั้ง')
      } finally {
        window.clearTimeout(timeoutId)
      }
    }
    loadLineProfile()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [adminPreview, authAttempt, liffId, loadDashboard, scriptReady])

  // Load repairs when switching to repair tab
  useEffect(() => {
    if (tab === 'repairs' && repairs === null && (adminPreview || portalToken)) {
      setTimeout(() => {
        void loadRepairs(portalToken, selectedRoomId)
      }, 0)
    }
  }, [adminPreview, tab, repairs, portalToken, selectedRoomId, loadRepairs])

  const currentBill    = data?.bills.find((bill) => isBillPayable(bill.status, bill.remaining_amount)) ?? data?.bills[0] ?? null
  const monthlyRent    = data?.contract?.monthly_rent ?? 0
  const totalOutstanding = useMemo(() =>
    data?.bills.reduce(
      (sum, bill) => sum + (isBillPayable(bill.status, bill.remaining_amount) ? bill.remaining_amount : 0),
      0
    ) ?? 0, [data])

  return (
    <>
      {!adminPreview && liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
          onError={() => setError('โหลด LINE SDK ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')}
        />
      )}

      <div className="space-y-4">
        {!data && !error && <PortalLoadingState status={status} />}

        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setError('')
                setStatus(adminPreview ? 'กำลังโหลดข้อมูล Portal' : 'กำลังเชื่อมต่อ LINE')
                if (adminPreview && selectedRoomId) {
                  loadDashboard('', selectedRoomId)
                } else if (window.liff) {
                  setAuthAttempt((attempt) => attempt + 1)
                } else {
                  window.location.reload()
                }
              }}
              className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Room card */}
            <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">ห้องพักปัจจุบัน</p>
                  <h2 className="mt-1 text-4xl font-bold tracking-tight">{data.room?.room_number ?? '-'}</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {data.tenant.full_name}{data.room?.room_number ? ` · แถวที่ ${roomRow(data.room.room_number)}` : ''}
                  </p>
                </div>
                {adminPreview ? (
                  <div className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-200">
                    ดูโดยผู้ดูแล
                  </div>
                ) : linePictureUrl ? (
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={linePictureUrl}
                      alt={lineDisplayName}
                      referrerPolicy="no-referrer"
                      className="size-14 rounded-full object-cover ring-2 ring-[#06C755] ring-offset-2 ring-offset-slate-950"
                    />
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#06C755] text-[10px] font-bold text-white shadow">
                      L
                    </span>
                  </div>
                ) : (
                  <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">เชื่อม LINE แล้ว</div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="ค่าเช่าต่อเดือน" value={`฿${money.format(monthlyRent)}`} />
                <Metric label="ค้างชำระ" value={`฿${money.format(totalOutstanding)}`} tone={totalOutstanding > 0 ? 'warn' : 'ok'} />
              </div>
            </section>

            {/* Room selector — แสดงเฉพาะเมื่อมีหลายห้อง */}
            {rooms.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {rooms.map((r) => (
                  <button
                    key={r.room_id}
                    type="button"
                    onClick={() => {
                      setSelectedRoomId(r.room_id)
                      repairsRequestId.current += 1
                      setRepairs(null)
                      setRepairsLoading(false)
                      loadDashboard(portalToken, r.room_id)
                    }}
                    className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      selectedRoomId === r.room_id
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🏠 ห้อง {r.room_number}
                  </button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
              <TabBtn active={tab === 'bills'} onClick={() => setTab('bills')}>
                <Receipt className="size-3.5" /> บิล &amp; ชำระเงิน
              </TabBtn>
              <TabBtn active={tab === 'repairs'} onClick={() => setTab('repairs')}>
                <Wrench className="size-3.5" /> แจ้งซ่อม
              </TabBtn>
            </div>

            {/* Bills tab */}
            {tab === 'bills' && (
              <>
                {!data.contract && (
                  <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    ยังไม่พบสัญญาเช่าที่กำลังใช้งาน
                  </div>
                )}
                {currentBill && <CurrentBillCard bill={currentBill} promptpay={data.promptpay} paymentAmount={totalOutstanding} />}
                <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock className="size-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-800">ประวัติบิลและการชำระ</h2>
                  </div>
                  <div className="space-y-3">
                    {data.bills.length > 0
                      ? data.bills.map((bill) => <BillHistoryItem key={bill.id} bill={bill} adminPreview={adminPreview} />)
                      : <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">ยังไม่มีประวัติบิล</p>
                    }
                  </div>
                </section>
              </>
            )}

            {/* Repairs tab */}
            {tab === 'repairs' && (
              <>
                {!adminPreview && (
                  <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <Wrench className="size-4 text-slate-400" />
                      <h2 className="text-sm font-semibold text-slate-800">แจ้งซ่อม / แจ้งปัญหา</h2>
                    </div>
                    <RepairSubmit portalToken={portalToken} roomId={selectedRoomId} onSuccess={() => loadRepairs(portalToken, selectedRoomId)} />
                  </section>
                )}

                <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock className="size-4 text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-800">ประวัติการแจ้งซ่อม</h2>
                  </div>
                  {repairsLoading
                    ? <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-slate-400" /></div>
                    : <RepairHistory repairs={repairs ?? []} />
                  }
                </section>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'ok' }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={tone === 'warn' ? 'font-bold text-amber-300' : tone === 'ok' ? 'font-bold text-emerald-300' : 'font-bold text-white'}>
        {value}
      </p>
    </div>
  )
}

function PortalLoadingState({ status }: { status: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Loader2 className="size-7 animate-spin" />
          <span className="absolute inset-0 rounded-2xl ring-4 ring-emerald-100/70 animate-ping" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">กำลังเปิดข้อมูลห้อง</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{status}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-100" />
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-xl bg-slate-50" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-50" />
        </div>
      </div>
    </section>
  )
}

function CurrentBillCard({
  bill,
  promptpay,
  paymentAmount,
}: {
  bill: TenantPortalData['bills'][number]
  promptpay: TenantPortalData['promptpay']
  paymentAmount: number
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">บิลล่าสุด</p>
          <h2 className="text-xl font-bold text-slate-950">{monthFmt.format(new Date(bill.billing_month))}</h2>
        </div>
        <StatusBadge status={bill.status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoBox icon={Home}   label="ค่าห้อง" value={`฿${money.format(bill.rent_amount)}`} />
        <InfoBox icon={Wallet} label="ยอดรวม"  value={`฿${money.format(bill.total_amount)}`} />
        <InfoBox icon={Droplets} label="ค่าน้ำ" value={`฿${money.format(bill.water_amount)}`} />
        <InfoBox icon={Zap}   label="ค่าไฟ"    value={`฿${money.format(bill.electricity_amount)}`} />
        {(bill.wifi_amount || 0) > 0 && (
          <InfoBox icon={Wifi} label="ค่า WiFi" value={`฿${money.format(bill.wifi_amount || 0)}`} />
        )}
        <InfoBox icon={Trash2} label="ค่าขยะ" value={`฿${money.format(bill.trash_amount || 0)}`} />
      </div>

      <MeterBlock bill={bill} />

      {bill.remaining_amount > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-600 font-medium">ยังค้างชำระ</span>
          <span className="text-sm font-bold text-amber-700">฿{money.format(bill.remaining_amount)}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-xs text-slate-500">ครบกำหนด</span>
        <span className="text-sm font-semibold text-slate-800">{dateFmt.format(new Date(bill.due_date))}</span>
      </div>

      {paymentAmount > 0 && promptpay.id && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">สแกน QR ชำระยอดค้างทั้งหมด</p>
          {paymentAmount > bill.remaining_amount && (
            <p className="mb-3 text-xs text-amber-600">
              รวมบิลเดือนก่อนแล้ว ฿{money.format(paymentAmount)}
            </p>
          )}
          <PromptPayQR
            promptpayId={promptpay.id}
            promptpayName={promptpay.name ?? ''}
            amount={paymentAmount}
          />
        </div>
      )}
    </section>
  )
}

function InfoBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
        <Icon className="size-3.5" />{label}
      </div>
      <p className="font-bold text-slate-900">{value}</p>
    </div>
  )
}

function MeterBlock({ bill }: { bill: TenantPortalData['bills'][number] }) {
  if (!bill.meter) return null
  const imgs = [bill.meter.water_image_url, bill.meter.electricity_image_url].filter(Boolean)
  return (
    <div className="mt-4 rounded-xl border border-slate-100 p-3">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays className="size-4 text-slate-400" />
        <p className="text-sm font-semibold text-slate-800">มิเตอร์เดือนนี้</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <MeterLine label="น้ำ" prev={bill.meter.water_prev} curr={bill.meter.water_curr} units={bill.meter.water_units} />
        <MeterLine label="ไฟ" prev={bill.meter.electricity_prev} curr={bill.meter.electricity_curr} units={bill.meter.electricity_units} />
      </div>
      {imgs.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {bill.meter.water_image_url && <MeterImage label="รูปมิเตอร์น้ำ" src={bill.meter.water_image_url} />}
          {bill.meter.electricity_image_url && <MeterImage label="รูปมิเตอร์ไฟ" src={bill.meter.electricity_image_url} />}
        </div>
      )}
    </div>
  )
}

function MeterLine({ label, prev, curr, units }: { label: string; prev: number; curr: number; units: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-500">{prev} → {curr}</p>
      <p className="font-semibold text-slate-900">{units} หน่วย</p>
    </div>
  )
}

function MeterImage({ label, src }: { label: string; src: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className="aspect-square w-full object-cover" />
      <p className="bg-slate-50 px-2 py-1 text-center text-[11px] text-slate-500">{label}</p>
    </a>
  )
}

function BillHistoryItem({ bill, adminPreview = false }: { bill: TenantPortalData['bills'][number]; adminPreview?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{monthFmt.format(new Date(bill.billing_month))}</p>
          <p className="text-xs text-slate-400">
            ยอดรวม ฿{money.format(bill.total_amount)} · ชำระแล้ว ฿{money.format(bill.paid_amount)}
          </p>
        </div>
        <StatusBadge status={bill.status} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">คงเหลือ ฿{money.format(bill.remaining_amount)}</p>
        <Link href={adminPreview ? `/bills/${bill.id}` : bill.detail_url ?? '/portal'} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
          ดูบิล <ExternalLink className="size-3" />
        </Link>
      </div>

      {bill.payments.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {bill.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">{dateFmt.format(new Date(p.paid_at))} · {p.payment_method}</span>
              <span className="font-semibold text-emerald-700">฿{money.format(p.amount)}</span>
              {p.slip_url && <a href={p.slip_url} target="_blank" rel="noreferrer" className="text-slate-400 underline">สลิป</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'paid')    return <Badge className="bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-3" />{statusLabel[status]}</Badge>
  if (status === 'overdue') return <Badge className="bg-rose-50 text-rose-700"><AlertCircle className="size-3" />{statusLabel[status]}</Badge>
  return <Badge className="bg-amber-50 text-amber-700"><Clock className="size-3" />{statusLabel[status] ?? status}</Badge>
}
