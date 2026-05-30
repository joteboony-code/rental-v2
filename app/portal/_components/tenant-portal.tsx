'use client'

import Script from 'next/script'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Droplets,
  ExternalLink,
  Home,
  Loader2,
  Wallet,
  Zap,
} from 'lucide-react'
import { getTenantPortalDashboard, type TenantPortalData } from '@/app/actions/portal'
import { Badge } from '@/components/ui/badge'
import type { LiffClient } from '@/lib/liff-types'

declare global {
  interface Window {
    liff?: LiffClient
  }
}

type TenantPortalProps = {
  liffId?: string | null
}

const money = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const monthFmt = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'long',
})

const dateFmt = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const statusLabel: Record<string, string> = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'เกินกำหนด',
  cancelled: 'ยกเลิก',
}

export function TenantPortal({ liffId }: TenantPortalProps) {
  const [scriptReady, setScriptReady] = useState(false)
  const [lineUserId, setLineUserId] = useState('')
  const [status, setStatus] = useState(
    liffId ? 'กำลังเชื่อมต่อ LINE' : 'กำลังเตรียมข้อมูลห้อง'
  )
  const [data, setData] = useState<TenantPortalData | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const loadDashboard = useCallback((userId = lineUserId) => {
    const trimmed = userId.trim()
    if (!trimmed) return

    setError('')
    startTransition(async () => {
      const result = await getTenantPortalDashboard(trimmed)
      if (!result.success) {
        setData(null)
        setError(result.message)
        return
      }
      setData(result.data)
    })
  }, [lineUserId])

  useEffect(() => {
    if (!liffId || !scriptReady) return

    const currentLiffId = liffId
    let cancelled = false

    async function loadLineProfile() {
      try {
        const liff = window.liff
        if (!liff) {
          setStatus('โหลด LIFF SDK ไม่สำเร็จ')
          return
        }

        await liff.init({ liffId: currentLiffId })
        if (cancelled) return

        if (!liff.isLoggedIn()) {
          setStatus('กำลังเข้าสู่ระบบ LINE')
          liff.login({ redirectUri: window.location.href })
          return
        }

        const profile = await liff.getProfile()
        if (cancelled) return
        setLineUserId(profile.userId)
        setStatus('เชื่อมต่อ LINE แล้ว')
        loadDashboard(profile.userId)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setStatus('ยังดึงข้อมูลจาก LINE ไม่ได้')
        }
      }
    }

    loadLineProfile()

    return () => {
      cancelled = true
    }
  }, [liffId, loadDashboard, scriptReady])

  const currentBill = data?.bills[0] ?? null
  const monthlyRent = data?.contract?.monthly_rent ?? 0
  const totalOutstanding = useMemo(
    () => data?.bills.reduce((sum, bill) => sum + bill.remaining_amount, 0) ?? 0,
    [data]
  )

  return (
    <>
      {liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
          onError={() => setStatus('โหลด LIFF SDK ไม่สำเร็จ')}
        />
      )}

      <div className="space-y-4">
        {!data && !error && (
          <PortalLoadingState status={status} />
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    ห้องพักปัจจุบัน
                  </p>
                  <h2 className="mt-1 text-4xl font-bold tracking-tight">
                    {data.room?.room_number ?? '-'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {data.tenant.full_name}
                    {data.room?.floor ? ` · ชั้น ${data.room.floor}` : ''}
                  </p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                  เชื่อม LINE แล้ว
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="ค่าเช่าต่อเดือน" value={`฿${money.format(monthlyRent)}`} />
                <Metric label="ค้างชำระ" value={`฿${money.format(totalOutstanding)}`} tone={totalOutstanding > 0 ? 'warn' : 'ok'} />
              </div>
            </section>

            {currentBill && <CurrentBillCard bill={currentBill} />}

            {!data.contract && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                ยังไม่พบสัญญาเช่าที่กำลังใช้งานสำหรับบัญชี LINE นี้
              </div>
            )}

            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="size-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-800">ประวัติค่าเช่าและการชำระ</h2>
              </div>

              <div className="space-y-3">
                {data.bills.length > 0 ? (
                  data.bills.map((bill) => <BillHistoryItem key={bill.id} bill={bill} />)
                ) : (
                  <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
                    ยังไม่มีประวัติบิล
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </>
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

function CurrentBillCard({ bill }: { bill: TenantPortalData['bills'][number] }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">บิลล่าสุด</p>
          <h2 className="text-xl font-bold text-slate-950">
            {monthFmt.format(new Date(bill.billing_month))}
          </h2>
        </div>
        <StatusBadge status={bill.status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoBox icon={Home} label="ค่าห้อง" value={`฿${money.format(bill.rent_amount)}`} />
        <InfoBox icon={Wallet} label="ยอดรวม" value={`฿${money.format(bill.total_amount)}`} />
        <InfoBox icon={Droplets} label="ค่าน้ำ" value={`฿${money.format(bill.water_amount)}`} />
        <InfoBox icon={Zap} label="ค่าไฟ" value={`฿${money.format(bill.electricity_amount)}`} />
      </div>

      <MeterBlock bill={bill} />

      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-xs text-slate-500">ครบกำหนด</span>
        <span className="text-sm font-semibold text-slate-800">
          {dateFmt.format(new Date(bill.due_date))}
        </span>
      </div>
    </section>
  )
}

function InfoBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="font-bold text-slate-900">{value}</p>
    </div>
  )
}

function MeterBlock({ bill }: { bill: TenantPortalData['bills'][number] }) {
  if (!bill.meter) return null

  const meterImages = [bill.meter.water_image_url, bill.meter.electricity_image_url].filter(Boolean)

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
      {meterImages.length > 0 && (
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
      <p className="text-slate-500">
        {prev} → {curr}
      </p>
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

function BillHistoryItem({ bill }: { bill: TenantPortalData['bills'][number] }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">
            {monthFmt.format(new Date(bill.billing_month))}
          </p>
          <p className="text-xs text-slate-400">
            ยอดรวม ฿{money.format(bill.total_amount)} · ชำระแล้ว ฿{money.format(bill.paid_amount)}
          </p>
        </div>
        <StatusBadge status={bill.status} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          คงเหลือ ฿{money.format(bill.remaining_amount)}
        </p>
        <Link href={`/portal/${bill.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
          ดูบิล
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {bill.payments.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {bill.payments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                {dateFmt.format(new Date(payment.paid_at))} · {payment.payment_method}
              </span>
              <span className="font-semibold text-emerald-700">
                ฿{money.format(payment.amount)}
              </span>
              {payment.slip_url && (
                <a href={payment.slip_url} target="_blank" rel="noreferrer" className="text-slate-400 underline">
                  สลิป
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return (
      <Badge className="bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="size-3" />
        {statusLabel[status]}
      </Badge>
    )
  }

  if (status === 'overdue') {
    return (
      <Badge className="bg-rose-50 text-rose-700">
        <AlertCircle className="size-3" />
        {statusLabel[status]}
      </Badge>
    )
  }

  return (
    <Badge className="bg-amber-50 text-amber-700">
      <Clock className="size-3" />
      {statusLabel[status] ?? status}
    </Badge>
  )
}
