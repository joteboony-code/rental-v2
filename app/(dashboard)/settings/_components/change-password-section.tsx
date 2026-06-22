'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { changePasswordAndSignOutAll } from '@/app/actions/settings'

export function ChangePasswordSection() {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(changePasswordAndSignOutAll, undefined)

  useEffect(() => {
    if (!state?.success) return
    // Clear local Supabase session after server revoked all sessions
    createClient().auth.signOut().finally(() => {
      router.replace('/login')
    })
  }, [state?.success, router])

  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-red-100 bg-red-50">
        <ShieldAlert className="size-4 text-red-500" />
        <h2 className="text-sm font-semibold text-red-700">ความปลอดภัย — มือถือหายหรือถูกขโมย</h2>
      </div>
      <div className="px-5 py-5">
        <p className="text-xs text-slate-500 mb-4">
          เปลี่ยนรหัสผ่านและออกจากระบบทุกเครื่องพร้อมกัน — แม้เครื่องที่หายจะมีรหัสเก่าบันทึกไว้ก็ login ไม่ได้อีก
        </p>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">รหัสผ่านปัจจุบัน</Label>
            <Input
              type="password"
              name="current_password"
              placeholder="ยืนยันตัวตนก่อนเปลี่ยน"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">รหัสผ่านใหม่</Label>
            <Input
              type="password"
              name="new_password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">ยืนยันรหัสผ่านใหม่</Label>
            <Input
              type="password"
              name="confirm_password"
              placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              autoComplete="new-password"
              required
            />
          </div>

          {state?.message && !state.success && (
            <p className="text-xs text-red-600 font-medium">{state.message}</p>
          )}

          <Button
            type="submit"
            disabled={isPending}
            variant="destructive"
            className="w-full h-10 mt-1"
          >
            {isPending
              ? <><Loader2 className="size-4 animate-spin mr-2" />กำลังดำเนินการ...</>
              : 'เปลี่ยนรหัสผ่าน + ออกจากระบบทุกเครื่อง'}
          </Button>
        </form>
      </div>
    </div>
  )
}
