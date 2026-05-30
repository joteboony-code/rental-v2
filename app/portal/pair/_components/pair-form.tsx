'use client'

import Script from 'next/script'
import { useActionState, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { pairTenantLine, type PairLineState } from '@/app/actions/pair'
import type { LiffClient } from '@/lib/liff-types'
import { AlertTriangle, CheckCircle2, Loader2, LogIn, RefreshCw, UserRound } from 'lucide-react'

declare global {
  interface Window {
    liff?: LiffClient
  }
}

type PairFormProps = {
  liffId?: string | null
  initialRoomNumber?: string
  alreadyLinked?: boolean
}

type LiffStatus = 'loading' | 'ok' | 'need-login' | 'no-liff' | 'error'
type FriendStatus = 'unchecked' | 'checking' | 'friend' | 'not-friend' | 'error'

export function PairForm({
  liffId,
  initialRoomNumber = '',
  alreadyLinked = false,
}: PairFormProps) {
  const [state, action, pending] = useActionState<PairLineState, FormData>(
    pairTenantLine,
    undefined
  )
  const [scriptReady, setScriptReady] = useState(false)
  const [lineUserId, setLineUserId] = useState('')
  const [lineDisplayName, setLineDisplayName] = useState('')
  const [liffStatus, setLiffStatus] = useState<LiffStatus>(liffId ? 'loading' : 'no-liff')
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('unchecked')

  // ── LIFF init + profile ──────────────────────────────────────
  useEffect(() => {
    if (!liffId || !scriptReady) return
    let cancelled = false

    async function loadProfile() {
      try {
        const liff = window.liff
        if (!liff) { setLiffStatus('error'); return }
        await liff.init({ liffId: liffId! })
        if (cancelled) return
        if (!liff.isLoggedIn()) { setLiffStatus('need-login'); return }
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

  // ── Friendship check ─────────────────────────────────────────
  useEffect(() => {
    if (liffStatus !== 'ok') return
    checkFriendship()
  }, [liffStatus])

  async function checkFriendship() {
    setFriendStatus('checking')
    try {
      const friendship = await window.liff?.getFriendship()
      setFriendStatus(friendship?.friendFlag ? 'friend' : 'not-friend')
    } catch {
      setFriendStatus('error')
    }
  }

  async function handleRequestFriendship() {
    try {
      await window.liff?.requestFriendship()
      await checkFriendship()
    } catch {
      await checkFriendship()
    }
  }

  function loginWithLine() {
    window.liff?.login({ redirectUri: window.location.href })
  }

  const inLiff = liffStatus === 'ok'
  const isFriend = friendStatus === 'friend'
  const confirmDisabled = pending || !lineUserId || !isFriend

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

      {/* Status */}
      {liffStatus === 'loading' && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <RefreshCw className="size-4 shrink-0 animate-spin" />
          <span>กำลังตรวจสอบ LINE...</span>
        </div>
      )}

      {(liffStatus === 'no-liff' || liffStatus === 'error') && (
        <div className="rounded-2xl bg-white px-5 py-6 shadow-sm text-center space-y-2">
          <p className="text-slate-700 font-semibold">กรุณาเปิดลิงก์ผ่าน LINE</p>
          <p className="text-slate-400 text-sm">สแกน QR code จากกล้องใน LINE app</p>
        </div>
      )}

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

      {/* Already-linked warning */}
      {alreadyLinked && inLiff && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>ห้องนี้มี LINE จับคู่อยู่แล้ว การยืนยันจะแทนที่บัญชีเดิม</span>
        </div>
      )}

      {/* Room info */}
      {initialRoomNumber && inLiff && (
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">ห้องที่จะจับคู่</p>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-3xl font-bold text-slate-900">ห้อง {initialRoomNumber}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              alreadyLinked ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {alreadyLinked ? 'มี LINE เดิม' : 'พร้อมจับคู่'}
            </span>
          </div>
        </div>
      )}

      {/* LINE account */}
      {inLiff && (
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <UserRound className="size-6 text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">
                {lineDisplayName ? `บัญชี LINE: ${lineDisplayName}` : 'บัญชี LINE'}
              </p>
              <p className="truncate text-xs text-slate-400">ดึง LINE User ID แล้ว</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
              friendStatus === 'checking'   ? 'bg-slate-100 text-slate-400' :
              friendStatus === 'friend'     ? 'bg-emerald-50 text-emerald-700' :
              friendStatus === 'not-friend' ? 'bg-red-50 text-red-600' :
                                             'bg-slate-100 text-slate-400'
            }`}>
              {friendStatus === 'checking'   ? '...' :
               friendStatus === 'friend'     ? 'เพิ่มแล้ว ✓' :
               friendStatus === 'not-friend' ? 'ยังไม่เพิ่ม' : '?'}
            </span>
          </div>
        </div>
      )}

      {/* Add friend / refresh */}
      {inLiff && !isFriend && (
        <button
          type="button"
          onClick={handleRequestFriendship}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] text-sm font-bold text-white shadow-sm active:opacity-90"
        >
          <span className="text-lg font-light">+</span>
          เพิ่ม LINE OA / ปลดบล็อก
        </button>
      )}

      {inLiff && (
        <button
          type="button"
          onClick={checkFriendship}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-semibold text-slate-500 shadow-sm active:bg-slate-50"
        >
          <RefreshCw className={`size-3.5 ${friendStatus === 'checking' ? 'animate-spin' : ''}`} />
          ตรวจสอบสถานะ LINE OA อีกครั้ง
        </button>
      )}

      {/* Confirm form */}
      {lineUserId && (
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

          {!isFriend && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
              กรุณาเพิ่ม LINE OA ก่อน จึงจะกดยืนยันจับคู่ได้
            </p>
          )}

          <button
            type="submit"
            disabled={confirmDisabled}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a3a6b] text-sm font-bold text-white shadow-sm disabled:opacity-50 active:opacity-90"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            ยืนยันจับคู่ LINE กับห้องนี้
          </button>
        </form>
      )}

      {/* Steps */}
      {inLiff && (
        <div className="space-y-2.5 pb-4">
          {[
            'เพิ่ม LINE OA ของหอพักให้เรียบร้อย (กดปุ่มสีเขียวด้านบน)',
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
      )}
    </>
  )
}
