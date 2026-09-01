'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { regenerateRegistrationToken } from '@/app/actions/registrations'
import { unlinkContractLineRecipient } from '@/app/actions/pair'
import { buildRegisterUrl, buildPairUrl } from '@/lib/pair-url'
import { QrCode, RefreshCw, Copy, Check, Link2Off, MessageCircle, UserRound } from 'lucide-react'
import { StyledQR } from '@/components/ui/styled-qr'

export function RegistrationQrCard({
  roomId,
  roomNumber,
  registrationToken,
  appUrl,
  liffId,
  hasActiveContract,
  contractId,
  tenantId,
  lineRecipient,
}: {
  roomId: string
  roomNumber: string
  registrationToken: string | null
  appUrl: string | null
  liffId: string | null
  hasActiveContract: boolean
  contractId: string | null
  tenantId: string | null
  lineRecipient: {
    userId: string
    displayName: string | null
    pictureUrl: string | null
    source: 'contract' | 'tenant'
  } | null
}) {
  const router = useRouter()
  const [token, setToken] = useState(registrationToken)
  const [tab, setTab] = useState<'register' | 'pair'>(hasActiveContract ? 'pair' : 'register')
  const [copied, setCopied] = useState(false)
  const [recipientError, setRecipientError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const currentRecipient = lineRecipient

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

  function handleReplaceRecipient() {
    if (!contractId || !tenantId || currentRecipient?.source !== 'contract') return
    const confirmed = window.confirm(
      `ยืนยันเปลี่ยนผู้รับบิล LINE ห้อง ${roomNumber}?\n\n` +
      'ระบบจะยกเลิกผู้รับคนเดิมเฉพาะห้องนี้ จากนั้นให้คนใหม่สแกน QR ด้านล่าง'
    )
    if (!confirmed) return

    setRecipientError(null)
    startTransition(async () => {
      const result = await unlinkContractLineRecipient(contractId, tenantId)
      if (!result.success) {
        setRecipientError(result.message ?? 'ไม่สามารถยกเลิกผู้รับบิลเดิมได้')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <QrCode className="size-3.5" /> {hasActiveContract ? 'QR ผู้รับบิล LINE' : 'QR ลงทะเบียน / จับคู่'}
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

      {hasActiveContract && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <MessageCircle className="size-3.5" /> ผู้รับบิล LINE ปัจจุบัน
          </p>

          {currentRecipient ? (
            <>
              <div className="flex items-center gap-3">
                {currentRecipient.pictureUrl ? (
                  <Image
                    src={currentRecipient.pictureUrl}
                    alt={currentRecipient.displayName ?? 'LINE profile'}
                    width={40}
                    height={40}
                    className="size-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                    unoptimized
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-200">
                    <UserRound className="size-5 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {currentRecipient.displayName ?? 'บัญชี LINE'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {currentRecipient.source === 'contract' ? 'ผู้รับบิลเฉพาะห้องนี้' : 'LINE ของผู้เช่าหลัก'}
                  </p>
                </div>
              </div>

              {currentRecipient.source === 'contract' ? (
                <button
                  type="button"
                  onClick={handleReplaceRecipient}
                  disabled={isPending}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  <Link2Off className="size-3.5" />
                  {isPending ? 'กำลังยกเลิกคนเดิม…' : 'เปลี่ยนผู้รับบิล LINE'}
                </button>
              ) : (
                <p className="rounded-lg bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                  ให้คนใหม่สแกน QR ด้านล่างได้เลย ระบบจะตั้งเป็นผู้รับบิลเฉพาะห้องนี้โดยไม่เปลี่ยนผู้เช่าหลัก
                </p>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-white px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-600">ยังไม่มีผู้รับบิล LINE</p>
              <p className="mt-0.5 text-[11px] text-slate-400">ให้คนใหม่สแกน QR ด้านล่างเพื่อเชื่อมห้อง</p>
            </div>
          )}

          {recipientError && <p className="text-xs text-rose-600">{recipientError}</p>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden border border-slate-100 text-xs font-semibold">
        {!hasActiveContract && (
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
        )}
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
