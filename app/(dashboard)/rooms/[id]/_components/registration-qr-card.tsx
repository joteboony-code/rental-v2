'use client'

import { useState, useEffect, useTransition } from 'react'
import { regenerateRegistrationToken } from '@/app/actions/registrations'
import { QrCode, RefreshCw, Copy, Check } from 'lucide-react'

export function RegistrationQrCard({
  roomId,
  roomNumber,
  registrationToken,
  appUrl,
}: {
  roomId: string
  roomNumber: string
  registrationToken: string | null
  appUrl: string | null
}) {
  const [token, setToken] = useState(registrationToken)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [origin, setOrigin] = useState<string>('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const baseUrl = appUrl || origin
  const registerUrl = token && baseUrl ? `${baseUrl}/portal/register?token=${token}` : null

  function handleCopy() {
    if (!registerUrl) return
    navigator.clipboard.writeText(registerUrl).then(() => {
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

  const qrUrl = registerUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(registerUrl)}`
    : null

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <QrCode className="size-3.5" /> QR ลงทะเบียนผู้เช่า
        </p>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className={`size-3.5 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'กำลังสร้าง...' : 'Regenerate'}
        </button>
      </div>

      {qrUrl && registerUrl ? (
        <>
          <div className="flex gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR ลงทะเบียน"
              className="size-32 rounded-xl border border-slate-100 shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-xs text-slate-500">ลิงก์ลงทะเบียน ห้อง {roomNumber}</p>
              <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 rounded-lg p-2 leading-relaxed">
                {registerUrl}
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
          <p className="text-xs text-slate-400">ให้ผู้เช่าสแกน QR นี้ผ่าน LINE เพื่อลงทะเบียนเข้าห้องพัก</p>
        </>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีลิงก์ลงทะเบียน</p>
      )}
    </div>
  )
}
