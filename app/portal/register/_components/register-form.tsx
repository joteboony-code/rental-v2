'use client'

import Script from 'next/script'
import { useEffect, useState, useTransition } from 'react'
import { submitRegistration, type SubmitRegistrationResult } from '@/app/actions/registrations'
import type { LiffClient } from '@/lib/liff-types'
import { CheckCircle2, Loader2, RefreshCw, UserRound, AlertTriangle, LogIn } from 'lucide-react'
import { Input } from '@/components/ui/input'

declare global {
  interface Window { liff?: LiffClient }
}

type Room = { id: string; room_number: string; status: string; monthly_rent: number }

type LiffStatus = 'loading' | 'ok' | 'need-login' | 'no-liff' | 'error'
type FriendStatus = 'unchecked' | 'checking' | 'friend' | 'not-friend' | 'error'

export function RegisterForm({ room, liffId, registrationToken }: { room: Room; liffId: string | null; registrationToken: string | null }) {
  const [scriptReady, setScriptReady] = useState(false)
  const [liffStatus, setLiffStatus] = useState<LiffStatus>(liffId ? 'loading' : 'no-liff')
  const [lineUserId, setLineUserId] = useState('')
  const [lineDisplayName, setLineDisplayName] = useState('')
  const [linePictureUrl, setLinePictureUrl] = useState('')
  const [lineIdToken, setLineIdToken] = useState('')
  const [lineAccessToken, setLineAccessToken] = useState('')
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('unchecked')
  const [result, setResult] = useState<SubmitRegistrationResult | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!liffId || !scriptReady) return
    let cancelled = false
    async function init() {
      try {
        const liff = window.liff
        if (!liff) { setLiffStatus('error'); return }
        await liff.init({ liffId: liffId! })
        if (cancelled) return
        if (!liff.isLoggedIn()) { setLiffStatus('need-login'); return }
        const profile = await liff.getProfile()
        if (cancelled) return
        const idToken = liff.getIDToken()
        const accessToken = liff.getAccessToken()
        setLineUserId(profile.userId)
        setLineDisplayName(profile.displayName ?? '')
        setLinePictureUrl(profile.pictureUrl ?? '')
        setLineIdToken(idToken ?? '')
        setLineAccessToken(accessToken ?? '')
        setLiffStatus('ok')
      } catch {
        if (!cancelled) setLiffStatus('error')
      }
    }
    init()
    return () => { cancelled = true }
  }, [liffId, scriptReady])

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
    } finally {
      await checkFriendship()
    }
  }

  function loginWithLine() {
    window.liff?.login({ redirectUri: window.location.href })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (friendStatus !== 'friend' || !lineIdToken || !lineAccessToken) {
      setResult({ success: false, message: 'กรุณาเพิ่ม LINE OA หรือปลดบล็อกก่อนลงทะเบียน' })
      return
    }
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await submitRegistration(fd)
      setResult(res)
    })
  }

  if (result?.success) {
    return (
      <div className="rounded-2xl bg-white px-5 py-8 shadow-sm text-center space-y-3">
        <div className="flex justify-center">
          <div className={`size-16 rounded-full flex items-center justify-center ${
            result.status === 'auto_approved' ? 'bg-emerald-50' : 'bg-amber-50'
          }`}>
            {result.status === 'auto_approved'
              ? <CheckCircle2 className="size-8 text-emerald-500" />
              : <RefreshCw className="size-8 text-amber-500" />}
          </div>
        </div>
        <div>
          <p className="font-bold text-slate-800 text-lg">
            {result.status === 'auto_approved' ? 'ลงทะเบียนสำเร็จ!' : 'ส่งคำขอแล้ว'}
          </p>
          <p className="mt-1 text-sm text-slate-500">{result.message}</p>
        </div>
        <p className="text-xs text-slate-400">ห้อง {room.room_number}</p>
      </div>
    )
  }

  const statusLabel = room.status === 'available' ? 'ว่าง' : room.status === 'occupied' ? 'มีผู้เช่า' : room.status
  const statusColor = room.status === 'available' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'

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

      {/* Room info card */}
      <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-medium text-slate-400">ห้องที่ลงทะเบียน</p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-3xl font-bold text-slate-900">ห้อง {room.room_number}</p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">ค่าเช่า ฿{Number(room.monthly_rent).toLocaleString()}/เดือน</p>
        {room.status === 'occupied' && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="inline size-3 mr-1" />
            ห้องนี้มีผู้เช่าอยู่แล้ว คำขอจะรอเจ้าของหอตรวจสอบก่อน
          </p>
        )}
      </div>

      {/* LINE status */}
      {liffStatus === 'loading' && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <RefreshCw className="size-4 shrink-0 animate-spin" />
          <span>กำลังดึงข้อมูล LINE...</span>
        </div>
      )}

      {liffStatus === 'need-login' && (
        <button
          type="button"
          onClick={loginWithLine}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm"
        >
          <LogIn className="size-4" /> เข้าสู่ระบบ LINE
        </button>
      )}

      {(liffStatus === 'no-liff' || liffStatus === 'error') && (
        <div className="rounded-2xl bg-white px-5 py-5 text-center shadow-sm">
          <p className="font-semibold text-slate-700">กรุณาเปิดลิงก์ผ่านแอป LINE</p>
          <p className="mt-1 text-xs text-slate-400">ระบบต้องตรวจสอบ LINE OA ก่อนลงทะเบียน</p>
        </div>
      )}

      {/* LINE profile card */}
      {liffStatus === 'ok' && lineUserId && (
        <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 overflow-hidden">
              {linePictureUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={linePictureUrl} alt="" className="size-12 object-cover" referrerPolicy="no-referrer" />
                : <UserRound className="size-6 text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800 text-sm">{lineDisplayName || 'บัญชี LINE'}</p>
              <p className="text-xs text-emerald-600 font-medium">✓ ดึง LINE User ID แล้ว</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
              friendStatus === 'friend' ? 'bg-emerald-50 text-emerald-700' :
              friendStatus === 'not-friend' ? 'bg-red-50 text-red-600' :
              'bg-slate-100 text-slate-400'
            }`}>
              {friendStatus === 'checking' ? '...' : friendStatus === 'friend' ? 'เพิ่มแล้ว ✓' : friendStatus === 'not-friend' ? 'ยังไม่เพิ่ม' : '?'}
            </span>
          </div>
        </div>
      )}

      {liffStatus === 'ok' && lineUserId && friendStatus !== 'friend' && (
        <button
          type="button"
          onClick={handleRequestFriendship}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#06C755] text-sm font-bold text-white shadow-sm active:opacity-90"
        >
          <span className="text-lg font-light">+</span> เพิ่ม LINE OA / ปลดบล็อก
        </button>
      )}

      {liffStatus === 'ok' && lineUserId && (
        <button
          type="button"
          onClick={checkFriendship}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-semibold text-slate-500 shadow-sm"
        >
          <RefreshCw className={`size-3.5 ${friendStatus === 'checking' ? 'animate-spin' : ''}`} />
          ตรวจสอบสถานะ LINE OA อีกครั้ง
        </button>
      )}

      {/* Registration form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="hidden" name="registration_token" value={registrationToken ?? ''} />
        <input type="hidden" name="line_id_token"     value={lineIdToken} />
        <input type="hidden" name="line_access_token" value={lineAccessToken} />
        <input type="hidden" name="line_display_name" value={lineDisplayName} />
        <input type="hidden" name="line_picture_url"  value={linePictureUrl} />

        <div className="rounded-2xl bg-white px-5 py-5 shadow-sm space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ข้อมูลผู้เช่า</p>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">ชื่อ-นามสกุล <span className="text-rose-500">*</span></label>
            <Input name="full_name" placeholder="เช่น สมชาย ใจดี" required className="h-11" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">เบอร์โทรศัพท์ <span className="text-rose-500">*</span></label>
            <Input name="phone" type="tel" placeholder="0812345678" required className="h-11" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">เลขบัตรประชาชน <span className="text-slate-400 font-normal text-xs">(ไม่บังคับ)</span></label>
            <Input name="id_card" placeholder="1234567890123" maxLength={13} className="h-11" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">เงินมัดจำ (฿) <span className="text-slate-400 font-normal text-xs">(ไม่บังคับ)</span></label>
            <Input name="deposit_paid" type="number" min="0" placeholder="เช่น 6000" className="h-11" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">วันที่เข้าอยู่ <span className="text-slate-400 font-normal text-xs">(ไม่บังคับ)</span></label>
            <Input name="move_in_date" type="date" className="h-11" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">หมายเหตุ <span className="text-slate-400 font-normal text-xs">(ไม่บังคับ)</span></label>
            <textarea
              name="note"
              placeholder="ข้อมูลเพิ่มเติม..."
              rows={2}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {result && !result.success && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{result.message}</p>
        )}

        <button
          type="submit"
          disabled={isPending || friendStatus !== 'friend' || !lineIdToken || !lineAccessToken}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a3a6b] text-sm font-bold text-white shadow-sm disabled:opacity-50"
        >
          {isPending ? <><Loader2 className="size-4 animate-spin" /> กำลังส่ง...</> : <><CheckCircle2 className="size-4" /> ยืนยันลงทะเบียน</>}
        </button>

        {friendStatus !== 'friend' && (
          <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-700">
            กรุณาเพิ่ม LINE OA ก่อน จึงจะกดยืนยันลงทะเบียนได้
          </p>
        )}
      </form>
    </>
  )
}
