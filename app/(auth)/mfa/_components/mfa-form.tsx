'use client'

import { useActionState } from 'react'
import { verifyMfa } from '@/app/actions/auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

export function MfaForm({ factorId }: { factorId: string }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="factor_id" value={factorId} />
      <div className="space-y-1.5">
        <Label htmlFor="code">รหัส Authenticator</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="••••••"
          className="text-center font-mono text-lg"
          required
          autoFocus
        />
      </div>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : 'ยืนยันและเข้าสู่ระบบ'}
      </Button>
    </form>
  )
}
