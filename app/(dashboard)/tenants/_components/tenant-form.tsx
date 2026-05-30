'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type TenantFormState, type Tenant } from '@/lib/definitions'
import { Loader2 } from 'lucide-react'

interface TenantFormProps {
  action: (state: TenantFormState, formData: FormData) => Promise<TenantFormState>
  tenant?: Tenant
  submitLabel?: string
}

export function TenantForm({ action, tenant, submitLabel = 'บันทึก' }: TenantFormProps) {
  const [state, formAction, isPending] = useActionState(action, undefined)

  return (
    <form action={formAction} className="space-y-5">
      {/* ── ข้อมูลพื้นฐาน ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">ข้อมูลผู้เช่า</h3>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={tenant?.full_name ?? ''}
            placeholder="เช่น นายสมชาย ใจดี"
            className={state?.errors?.full_name ? 'border-red-400' : ''}
          />
          {state?.errors?.full_name && (
            <p className="text-xs text-red-500">{state.errors.full_name[0]}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone">เบอร์โทรศัพท์</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={tenant?.phone ?? ''}
              placeholder="081-234-5678"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="id_card">เลขบัตรประชาชน</Label>
            <Input
              id="id_card"
              name="id_card"
              defaultValue={tenant?.id_card ?? ''}
              placeholder="1-xxxx-xxxxx-xx-x"
              maxLength={17}
            />
          </div>
        </div>
      </div>

      {/* ── LINE LIFF ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">LINE (สำหรับพอร์ทัลผู้เช่า)</h3>
        <div className="space-y-1.5">
          <Label htmlFor="line_user_id">LINE User ID</Label>
          <Input
            id="line_user_id"
            name="line_user_id"
            defaultValue={tenant?.line_user_id ?? ''}
            placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="font-mono text-sm"
          />
          <p className="text-xs text-gray-400">
            ผู้เช่าจะได้รับ LINE User ID หลังจากเปิด LIFF ครั้งแรก แล้วค่อยมากรอกในภายหลังได้
          </p>
        </div>
      </div>

      {/* ── ผู้ติดต่อฉุกเฉิน ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">ผู้ติดต่อฉุกเฉิน</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact">ชื่อผู้ติดต่อ</Label>
            <Input
              id="emergency_contact"
              name="emergency_contact"
              defaultValue={tenant?.emergency_contact ?? ''}
              placeholder="เช่น นางสมหวัง ใจดี"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency_phone">เบอร์โทรฉุกเฉิน</Label>
            <Input
              id="emergency_phone"
              name="emergency_phone"
              type="tel"
              defaultValue={tenant?.emergency_phone ?? ''}
              placeholder="081-234-5678"
            />
          </div>
        </div>
      </div>

      {/* ── หมายเหตุ ── */}
      <div className="space-y-1.5">
        <Label htmlFor="note">หมายเหตุ</Label>
        <Textarea
          id="note"
          name="note"
          defaultValue={tenant?.note ?? ''}
          placeholder="ข้อมูลเพิ่มเติม..."
          rows={3}
        />
      </div>

      {/* ── Error / Success message ── */}
      {state?.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.success
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {state.message}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            กำลังบันทึก...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  )
}
