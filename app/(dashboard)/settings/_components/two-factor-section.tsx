'use client'

import { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, ShieldOff, Loader2, X, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { cleanupStaleMfaFactors, logMfaSecurityEvent } from '@/app/actions/auth'

type Status = 'loading' | 'enabled' | 'disabled'

export function TwoFactorSection() {
  const [status, setStatus]       = useState<Status>('loading')
  const [factorId, setFactorId]   = useState<string | null>(null)
  const [step, setStep]           = useState<'idle' | 'enroll' | 'unenroll'>('idle')
  const [qrSvg, setQrSvg]         = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [enrollId, setEnrollId]   = useState<string | null>(null)
  const [code, setCode]           = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [busy, setBusy]           = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied]       = useState(false)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (err) { setStatus('disabled'); return }
      const totp = data?.totp?.find((factor) => factor.status === 'verified')
      if (totp) { setStatus('enabled'); setFactorId(totp.id) }
      else setStatus('disabled')
    })
  }, [supabase])

  async function startEnroll() {
    setBusy(true); setError(null)

    // Use server-side admin API to delete any unverified factors (client listFactors won't see them)
    await cleanupStaleMfaFactors()

    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (err || !data) {
      setError('เกิดข้อผิดพลาด: ' + (err?.message ?? 'ไม่ทราบสาเหตุ'))
      return
    }
    setQrSvg(data.totp.qr_code)
    setTotpSecret(data.totp.secret)
    setEnrollId(data.id)
    setStep('enroll')
    setCode('')
    setShowSecret(false)
  }

  async function confirmEnroll() {
    if (!enrollId) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollId, code })
    setBusy(false)
    if (err) { setError('รหัสไม่ถูกต้อง ลองอีกครั้ง'); return }
    await logMfaSecurityEvent('mfa_enabled')
    setStatus('enabled'); setFactorId(enrollId); setStep('idle'); setQrSvg(null); setTotpSecret(null); setCode('')
  }

  async function confirmUnenroll() {
    if (!factorId) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
    setBusy(false)
    if (err) { setError('เกิดข้อผิดพลาด: ' + err?.message); return }
    await logMfaSecurityEvent('mfa_disabled')
    setStatus('disabled'); setFactorId(null); setStep('idle'); setCode('')
  }

  function copySecret() {
    if (!totpSecret) return
    navigator.clipboard.writeText(totpSecret).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status === 'loading') {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex justify-center">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        <ShieldCheck className="size-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-800">การยืนยันตัวตน 2 ชั้น (2FA)</h2>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          status === 'enabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {status === 'enabled' ? '✅ เปิดใช้งาน' : 'ปิดอยู่'}
        </span>
      </div>

      <div className="px-5 py-5 space-y-4">
        {step === 'idle' && (
          <>
            <p className="text-xs text-slate-500">
              {status === 'enabled'
                ? 'เปิดใช้ 2FA แล้ว — ทุกครั้งที่ login ต้องกรอก OTP จาก Authenticator app ด้วย'
                : 'ป้องกันบัญชีด้วย Google Authenticator / Authy — แม้รหัสผ่านหลุด ก็ login ไม่ได้'}
            </p>
            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            {status === 'disabled' ? (
              <Button onClick={startEnroll} disabled={busy} className="w-full h-10">
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <ShieldCheck className="size-4 mr-2" />}
                เปิดใช้งาน 2FA
              </Button>
            ) : (
              <Button onClick={() => { setStep('unenroll'); setError(null) }}
                variant="outline" className="w-full h-10 text-red-600 border-red-200 hover:bg-red-50">
                <ShieldOff className="size-4 mr-2" />ปิดการใช้งาน 2FA
              </Button>
            )}
          </>
        )}

        {step === 'enroll' && qrSvg && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              1. เปิด <span className="font-semibold">Google Authenticator</span> หรือ <span className="font-semibold">Authy</span><br />
              2. กด &quot;+&quot; → <span className="font-semibold">สแกน QR code</span> (หรือกรอกรหัสเองด้านล่าง)<br />
              3. กรอกรหัส 6 หลักจากแอปด้านล่าง
            </p>

            {/* QR code */}
            <div className="flex justify-center bg-white p-4 rounded-xl border border-slate-100" style={{ colorScheme: 'light' }}>
              {qrSvg.startsWith('data:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSvg} alt="QR code สำหรับ 2FA" className="size-48" />
              ) : (
                <div
                  className="size-48 [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
            </div>

            {/* Manual entry toggle */}
            {totpSecret && (
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  สแกนไม่ได้? กรอกรหัสเองแทน
                  {showSecret ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
                {showSecret && (
                  <div className="px-4 pb-4 space-y-2 bg-slate-50">
                    <p className="text-xs text-slate-400">
                      ในแอป Authenticator → กด &quot;+&quot; → <span className="font-semibold">กรอกรหัสด้วยตนเอง / Enter setup key</span> → วางรหัสนี้
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-sm tracking-widest text-slate-800 break-all select-all">
                        {totpSecret}
                      </code>
                      <button
                        type="button"
                        onClick={copySecret}
                        className="shrink-0 flex items-center justify-center size-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                        title="คัดลอก"
                      >
                        {copied
                          ? <Check className="size-4 text-emerald-600" />
                          : <Copy className="size-4 text-slate-400" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">รหัส OTP จากแอป</Label>
              <Input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)}
                className="text-center font-mono text-lg tracking-widest" autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1"
                onClick={() => { setStep('idle'); setQrSvg(null); setTotpSecret(null); setError(null) }}>
                <X className="size-4 mr-1" />ยกเลิก
              </Button>
              <Button className="flex-1" onClick={confirmEnroll} disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}ยืนยัน
              </Button>
            </div>
          </div>
        )}

        {step === 'unenroll' && (
          <div className="space-y-4">
            <p className="text-xs text-red-600 font-medium">
              ⚠️ การปิด 2FA จะทำให้บัญชีปลอดภัยน้อยลง — แน่ใจหรือไม่?
            </p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1"
                onClick={() => { setStep('idle'); setError(null) }}>
                ยกเลิก
              </Button>
              <Button variant="destructive" className="flex-1" onClick={confirmUnenroll} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}ปิด 2FA
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
