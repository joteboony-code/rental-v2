'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ShieldCheck } from 'lucide-react'
import { login, verifyMfa } from '@/app/actions/auth'
import type { LoginState } from '@/app/actions/auth'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)
  const [mfaState, mfaAction, mfaPending] = useActionState(verifyMfa, undefined)

  // Step 2: OTP verification
  if (state && 'mfaRequired' in state && state.mfaRequired) {
    return (
      <form action={mfaAction} className="space-y-4">
        <input type="hidden" name="factor_id"   value={state.factorId} />
        <input type="hidden" name="challenge_id" value={state.challengeId} />

        <div className="flex flex-col items-center gap-2 pb-2">
          <div className="size-12 rounded-full bg-indigo-50 flex items-center justify-center">
            <ShieldCheck className="size-6 text-indigo-600" />
          </div>
          <p className="text-sm font-semibold text-slate-800">ยืนยันตัวตน 2 ชั้น</p>
          <p className="text-xs text-slate-500 text-center">
            เปิดแอป Authenticator แล้วกรอกรหัส 6 หลัก
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="code">รหัส OTP</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            autoComplete="one-time-code"
            className="text-center font-mono text-lg tracking-widest"
            autoFocus
            required
          />
        </div>

        {mfaState?.error && (
          <Alert variant="destructive">
            <AlertDescription>{mfaState.error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={mfaPending}>
          {mfaPending ? <Loader2 className="size-4 animate-spin" /> : 'ยืนยัน'}
        </Button>
      </form>
    )
  }

  // Step 1: Email + password
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">อีเมล</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && 'error' in state && state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : 'เข้าสู่ระบบ'}
      </Button>
    </form>
  )
}
