'use client'

import Script from 'next/script'
import { useActionState, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { pairTenantLine, type PairLineState } from '@/app/actions/pair'
import type { LiffClient } from '@/lib/liff-types'
import { CheckCircle2, Loader2, LogIn, RefreshCw, UserRound } from 'lucide-react'

declare global {
  interface Window {
    liff?: LiffClient
  }
}

type PairFormProps = {
  liffId?: string | null
  addFriendUrl?: string | null
  appOrigin?: string
  initialRoomNumber?: string
}

type LiffStatus = 'loading' | 'ok' | 'need-login' | 'no-liff' | 'error'

export function PairForm({
  liffId,
  addFriendUrl,
  initialRoomNumber = '',
}: PairFormProps) {
  const [state, action, pending] = useActionState<PairLineState, FormData>(
    pairTenantLine,
    undefined
  )
  const [scriptReady, setScriptReady] = useState(false)
  const [lineUserId, setLineUserId] = useState('')
  const [lineDisplayName, setLineDisplayName] = useState('')
  const [liffStatus, setLiffStatus] = useState<LiffStatus>(liffId ? 'loading' : 'no-liff')

  useEffect(() => {
    if (!liffId || !scriptReady) return
    let cancelled = false

    async function loadProfile() {
      try {
        const liff = window.liff
        if (!liff) { setLiffStatus('error'); return }
        await liff.init({ liffId: liffId! })
        if (cancelled) return
        if (!liff.isLoggedIn()) {
          setLiffStatus('need-login')
          return
        }
        const profile = await liff.getProfile()
        if (cancelled) return
        setLineUserId(profile.userId)
        setLineDisplayName(profile.displayName ?? '')
        setLiffStatus('ok')
      } catch {
        if (!cancelled) setLiffStatus('error')
      }
    }

    loadProfile()
    return () => { cancelled = true }
  }, [liffId, scriptReady])

  function loginWithLine() {
    window.liff?.login({ redirectUri: window.location.href })
  }

  const statusConfig: Record<LiffStatus, { text: string; color: string; spin: boolean }> = {
    loading:      { text: 'ลิงก์ QR ถูกต้อง กำลังตรวจสอบ LINE OA...', color: 'bg-emerald-50 text-emerald-700', spin: true },
    ok:           { text: `พร้อมจับคู่${lineDisplayName ? ` (${lineDisplayName})` : ''}`, color: 'bg-emerald-50 text-emerald-700', spin: false },
    'need-login': { text: 'กรุณาเข้าสู่ระบบ LINE เพื่อดึง User ID อัตโนมัติ', color: 'bg-amber-50 text-amber-700', spin: false },
    'no-liff':    { text: 'เปิดผ่าน LINE เพื่อดึง User ID อัตโนมัติ', color: 'bg-slate-50 text-slate-500', spin: false },
    error:        { text: 'ไม่สามารถเชื่อมต่อ LINE ได้ กรอก LINE User ID เองได้', color: 'bg-red-50 text-red-600', spin: false },
  }
  const status = statusConfig[liffStatus]

  return (
    <>
      {liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
          onError={() => setLiffStatus('error')}
        />
      )}

      {/* Status bubble */}
      <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium ${status.color}`}>
        <RefreshCw className={`size-4 shrink-0 ${status.spin ? 'animate-spin' : ''}`} />
        <span>{status.text}</span>
      </div>

      {/* Room info card */}
      {initialRoomNumber && (
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">ห้องที่จะจับคู่</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-3xl font-bold text-slate-900">ห้อง {initialRoomNumber}</p>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              QR พร้อมใช้
            </span>
          </div>
        </div>
      )}

      {/* LINE account card */}
      <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100">
            <UserRound className="size-6 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">
              {lineDisplayName ? `บัญชี LINE: ${lineDisplayName}` : 'บัญชี LINE'}
            </p>
            <p className="truncate text-xs text-slate-400">
              {lineUserId
                ? 'ดึง LINE User ID แล้ว'
                : 'ยังไม่ได้เพิ่ม LINE OA กรุณาเพิ่มก่อนจับคู่'}
            </p>
          </div>
        </div>
      </div>

      {/* Add LINE OA button */}
      {addFriendUrl && (
        <a
          href={addFriendUrl}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] text-sm font-bold text-white shadow-sm active:opacity-90"
        >
          <span className="text-lg font-light">+</span>
          เพิ่ม LINE OA / ปลดบล็อก
        </a>
      )}

      {/* LINE login button (shown when LIFF needs manual login) */}
      {liffStatus === 'need-login' && (
        <button
          type="button"
          onClick={loginWithLine}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50"
        >
          <LogIn className="size-4" />
          เข้าสู่ระบบ LINE
        </button>
      )}

      {/* Pair form */}
      <form action={action} className="space-y-3">
        <input type="hidden" name="room_number" value={initialRoomNumber} />
        <input type="hidden" name="line_user_id" value={lineUserId} />

        {state?.message && (
          <Alert variant={state.success ? 'default' : 'destructive'}>
            {state.success && <CheckCircle2 className="size-4 text-emerald-500" />}
            <AlertDescription>
              {state.message}
              {state.success && state.tenantName ? `: ${state.tenantName} ห้อง ${state.roomNumber}` : ''}
            </AlertDescription>
          </Alert>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] text-sm font-bold text-white shadow-sm disabled:opacity-60 active:opacity-90"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          ยืนยันจับคู่ LINE กับห้องนี้
        </button>
      </form>

      {/* Step instructions */}
      <div className="space-y-2.5 pb-4">
        {[
          'เพิ่ม LINE OA ของหอพักให้เรียบร้อย (กดปุ่มด้านบน)',
          'กด "ยืนยันจับคู่" เพื่อบันทึกบัญชี LINE เข้าระบบ',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3 text-sm text-slate-500">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </div>
        ))}
      </div>
    </>
  )
}
