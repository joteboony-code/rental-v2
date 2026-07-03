'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { regenerateRegistrationToken } from '@/app/actions/registrations'
import { buildRegisterUrl, buildPairUrl } from '@/lib/pair-url'
import { QrCode, RefreshCw, Copy, Check } from 'lucide-react'
import { StyledQR } from '@/components/ui/styled-qr'

export function RegistrationQrCard({
  roomId,
  roomNumber,
  registrationToken,
  appUrl,
  liffId,
}: {
  roomId: string
  roomNumber: string
  registrationToken: string | null
  appUrl: string | null
  liffId: string | null
}) {
  const [token, setToken] = useState(registrationToken)
  const [tab, setTab] = useState<'register' | 'pair'>('register')
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )
  const appOrigin = appUrl || origin

  const registerUrl = token
    ? buildRegisterUrl({ appOrigin, registrationToken: token, liffId })
    : null

  const pairUrl = buildPairUrl({ appOrigin, liffId, roomNumber })

  const activeUrl = tab === 'register' ? registerUrl : pairUrl

  function handleCopy() {
    if (!activeUrl) return
    navigator.clipboard.writeText(activeUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleRegenerate() {
    startTransition(async () => {
      const res = await regenerateRegistrationToken(roomId)
      if (res.success && res.token) setToken(res.token)
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <QrCode className="size-3.5" /> QR ลงทะเบียน / จับคู่
        </p>
        {tab === 'register' && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
          >
            <RefreshCw className={`size-3.5 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'กำลังสร้าง...' : 'Regenerate'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden border border-slate-100 text-xs font-semibold">
        <button
          type="button"
          onClick={() => { setTab('register'); setCopied(false) }}
          className={`flex-1 py-2 transition-colors ${
            tab === 'register'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
          }`}
        >
          ลงทะเบียนใหม่
        </button>
        <button
          type="button"
          onClick={() => { setTab('pair'); setCopied(false) }}
          className={`flex-1 py-2 transition-colors ${
            tab === 'pair'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
          }`}
        >
          LINE ผู้รับบิล
        </button>
      </div>

      {activeUrl ? (
        <>
          <div className="flex gap-4 items-start">
            <StyledQR value={activeUrl} size={128} />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-xs text-slate-500">
                {tab === 'register'
                  ? `ลิงก์ลงทะเบียน ห้อง ${roomNumber}`
                  : `ลิงก์ตั้งค่า LINE ผู้รับบิล ห้อง ${roomNumber}`}
              </p>
              <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 rounded-lg p-2 leading-relaxed">
                {activeUrl}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {copied ? <><Check className="size-3.5 text-emerald-500" /> คัดลอกแล้ว</> : <><Copy className="size-3.5" /> คัดลอกลิงก์</>}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            {tab === 'register'
              ? 'ให้ผู้เช่าสแกน QR นี้ผ่าน LINE เพื่อกรอกข้อมูลและลงทะเบียนเข้าห้องพัก'
              : 'ให้ผู้รับบิลของห้องนี้สแกน ระบบจะแยกเฉพาะ LINE โดยไม่เปลี่ยนผู้เช่า สัญญา มิเตอร์ หรือประวัติการเงิน'}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีลิงก์ลงทะเบียน</p>
      )}
    </div>
  )
}
