'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type ContractFormState, type Room } from '@/lib/definitions'
import { Loader2 } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'

interface ContractFormProps {
  action: (state: ContractFormState, formData: FormData) => Promise<ContractFormState>
  tenantId: string
  availableRooms: Pick<Room, 'id' | 'room_number' | 'monthly_rent' | 'floor'>[]
}

export function ContractForm({ action, tenantId, availableRooms }: ContractFormProps) {
  const [state, formAction, isPending] = useActionState(action, undefined)

  const today = new Date().toISOString().split('T')[0]

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="space-y-1.5">
        <Label htmlFor="room_id">ห้อง <span className="text-red-500">*</span></Label>
        <select
          id="room_id"
          name="room_id"
          required
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- เลือกห้อง --</option>
          {availableRooms.map((r) => (
            <option key={r.id} value={r.id}>
              ห้อง {r.room_number} แถวที่ {roomRow(r.room_number)} — ฿{r.monthly_rent.toLocaleString()}/เดือน
            </option>
          ))}
        </select>
        {state?.errors?.room_id && (
          <p className="text-xs text-red-500">{state.errors.room_id[0]}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">วันเริ่มสัญญา <span className="text-red-500">*</span></Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={today}
          />
          {state?.errors?.start_date && (
            <p className="text-xs text-red-500">{state.errors.start_date[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">วันสิ้นสุดสัญญา</Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
          />
          <p className="text-xs text-gray-400">ปล่อยว่างถ้าไม่กำหนด</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="monthly_rent">ค่าเช่า/เดือน (บาท) <span className="text-red-500">*</span></Label>
          <Input
            id="monthly_rent"
            name="monthly_rent"
            type="number"
            min="0"
            step="0.01"
            placeholder="5000"
          />
          {state?.errors?.monthly_rent && (
            <p className="text-xs text-red-500">{state.errors.monthly_rent[0]}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deposit_paid">เงินมัดจำที่รับแล้ว (บาท)</Label>
          <Input
            id="deposit_paid"
            name="deposit_paid"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">หมายเหตุ</Label>
        <Textarea
          id="note"
          name="note"
          placeholder="เช่น รวมค่าน้ำ, จอดรถ 1 คัน..."
          rows={2}
        />
      </div>

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
            กำลังสร้างสัญญา...
          </>
        ) : (
          'สร้างสัญญาเช่า'
        )}
      </Button>
    </form>
  )
}
