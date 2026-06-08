'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type RoomFormState, type Room } from '@/lib/definitions'

type Props = {
  action: (state: RoomFormState, formData: FormData) => Promise<RoomFormState>
  room?: Room
  submitLabel?: string
}

export function RoomForm({ action, room, submitLabel = 'บันทึก' }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const router = useRouter()

  useEffect(() => {
    if (!state?.message) return
    if (state.success) {
      toast.success(state.message, { description: room ? undefined : 'ห้องใหม่พร้อมใช้งานแล้ว' })
      if (!room) router.push('/rooms')
    } else {
      toast.error(state.message)
    }
  }, [state])

  return (
    <form action={formAction} className="space-y-4">
      {/* field-level errors only — success/error messages now use toast */}
      {state?.message && !state.success && !state.errors && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-red-50 text-red-600 border border-red-200">
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* เลขห้อง */}
        <div className="space-y-1.5">
          <Label htmlFor="room_number">เลขห้อง *</Label>
          <Input
            id="room_number"
            name="room_number"
            placeholder="เช่น 101, A201"
            defaultValue={room?.room_number}
            required
          />
          {state?.errors?.room_number && (
            <p className="text-xs text-red-500">{state.errors.room_number[0]}</p>
          )}
        </div>

        {/* แถว */}
        <div className="space-y-1.5">
          <Label htmlFor="floor">แถว</Label>
          <Input
            id="floor"
            name="floor"
            type="number"
            placeholder="เช่น 1, 2, 3"
            defaultValue={room?.floor ?? ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ประเภทห้อง */}
        <div className="space-y-1.5">
          <Label htmlFor="room_type">ประเภทห้อง *</Label>
          <select
            id="room_type"
            name="room_type"
            defaultValue={room?.room_type ?? 'standard'}
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="standard">Standard</option>
            <option value="deluxe">Deluxe</option>
            <option value="suite">Suite</option>
          </select>
        </div>

        {/* ขนาด */}
        <div className="space-y-1.5">
          <Label htmlFor="size_sqm">ขนาด (ตร.ม.)</Label>
          <Input
            id="size_sqm"
            name="size_sqm"
            type="number"
            step="0.01"
            placeholder="เช่น 28.5"
            defaultValue={room?.size_sqm ?? ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ค่าเช่า */}
        <div className="space-y-1.5">
          <Label htmlFor="monthly_rent">ค่าเช่า/เดือน (฿) *</Label>
          <Input
            id="monthly_rent"
            name="monthly_rent"
            type="number"
            step="0.01"
            placeholder="เช่น 3500"
            defaultValue={room?.monthly_rent ?? ''}
            required
          />
          {state?.errors?.monthly_rent && (
            <p className="text-xs text-red-500">{state.errors.monthly_rent[0]}</p>
          )}
        </div>

        {/* มัดจำ */}
        <div className="space-y-1.5">
          <Label htmlFor="deposit">มัดจำ (฿)</Label>
          <Input
            id="deposit"
            name="deposit"
            type="number"
            step="0.01"
            placeholder="เช่น 7000"
            defaultValue={room?.deposit ?? 0}
          />
        </div>

        {/* WiFi fee */}
        <div className="space-y-1.5">
          <Label htmlFor="wifi_fee">ค่า WiFi/เดือน (฿)</Label>
          <Input
            id="wifi_fee"
            name="wifi_fee"
            type="number"
            step="1"
            min="0"
            placeholder="ว่างเว้นถ้าห้องนี้ไม่มี WiFi"
            defaultValue={room?.wifi_fee ?? ''}
          />
          <p className="text-xs text-slate-400">เว้นว่างถ้าห้องนี้ไม่ใช้ WiFi</p>
        </div>
      </div>

      {/* สถานะ */}
      <div className="space-y-1.5">
        <Label htmlFor="status">สถานะ *</Label>
        <select
          id="status"
          name="status"
          defaultValue={room?.status ?? 'available'}
          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="available">ว่าง</option>
          <option value="occupied">มีผู้เช่า</option>
          <option value="maintenance">ซ่อมบำรุง</option>
          <option value="reserved">จอง</option>
        </select>
      </div>

      {/* รายละเอียด */}
      <div className="space-y-1.5">
        <Label htmlFor="description">รายละเอียดเพิ่มเติม</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="เช่น มีเฟอร์นิเจอร์ครบ, แอร์ 1 ตัว..."
          rows={3}
          defaultValue={room?.description ?? ''}
        />
      </div>

      <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-violet-800">ข้อมูลการจอง</p>
          <p className="text-xs text-violet-500">กรอกเมื่อเลือกสถานะ “จอง” เพื่อเก็บข้อมูลผู้สนใจเช่า</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="reserved_name">ชื่อผู้จอง</Label>
            <Input id="reserved_name" name="reserved_name" defaultValue={room?.reserved_name ?? ''} placeholder="ชื่อ-นามสกุล" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reserved_phone">เบอร์โทร</Label>
            <Input id="reserved_phone" name="reserved_phone" defaultValue={room?.reserved_phone ?? ''} placeholder="08x-xxx-xxxx" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reserved_deposit">เงินจอง (฿)</Label>
            <Input id="reserved_deposit" name="reserved_deposit" type="number" min="0" step="1" defaultValue={room?.reserved_deposit ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reservation_expires">หมดอายุจอง</Label>
            <Input id="reservation_expires" name="reservation_expires" type="date" defaultValue={room?.reservation_expires ?? ''} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reservation_note">หมายเหตุการจอง</Label>
          <Textarea id="reservation_note" name="reservation_note" rows={2} defaultValue={room?.reservation_note ?? ''} placeholder="เช่น นัดทำสัญญาวันเสาร์ / โอนเงินจองแล้ว" />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'กำลังบันทึก...' : submitLabel}
      </Button>
    </form>
  )
}
