'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type RepairFormState, type Room, type Tenant } from '@/lib/definitions'
import { Loader2, Upload, X } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'

interface Props {
  action:  (state: RepairFormState, formData: FormData) => Promise<RepairFormState>
  rooms:   Pick<Room, 'id' | 'room_number' | 'floor'>[]
  tenants: Pick<Tenant, 'id' | 'full_name'>[]
}

const priorityOptions = [
  { value: 'low',    label: '🟢 ต่ำ — ไม่เร่งด่วน' },
  { value: 'normal', label: '🔵 ปกติ' },
  { value: 'high',   label: '🟠 สูง — รีบ' },
  { value: 'urgent', label: '🔴 ด่วนมาก' },
]

export function RepairForm({ action, rooms, tenants }: Props) {
  const [state, formAction, isPending] = useActionState(action, undefined)
  const [preview, setPreview]          = useState<string | null>(null)

  return (
    <form action={formAction} className="space-y-4">
      {/* Room */}
      <div className="space-y-1.5">
        <Label htmlFor="room_id">ห้อง <span className="text-red-500">*</span></Label>
        <select
          id="room_id"
          name="room_id"
          required
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- เลือกห้อง --</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              ห้อง {r.room_number} แถวที่ {roomRow(r.room_number)}
            </option>
          ))}
        </select>
        {state?.errors?.room_id && (
          <p className="text-xs text-red-500">{state.errors.room_id[0]}</p>
        )}
      </div>

      {/* Tenant (optional) */}
      <div className="space-y-1.5">
        <Label htmlFor="tenant_id">ผู้แจ้ง (ถ้ามี)</Label>
        <select
          id="tenant_id"
          name="tenant_id"
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- ผู้ดูแลแจ้งเอง --</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="title">หัวข้อการซ่อม <span className="text-red-500">*</span></Label>
        <Input
          id="title"
          name="title"
          placeholder="เช่น ก๊อกน้ำรั่ว, ไฟดับ, ประตูพัง"
          required
        />
        {state?.errors?.title && (
          <p className="text-xs text-red-500">{state.errors.title[0]}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">รายละเอียด</Label>
        <Textarea id="description" name="description" rows={3} placeholder="อธิบายปัญหาเพิ่มเติม..." />
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <Label>ความเร่งด่วน</Label>
        <div className="grid grid-cols-2 gap-2">
          {priorityOptions.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="priority"
                value={opt.value}
                defaultChecked={opt.value === 'normal'}
                className="accent-blue-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Photo */}
      <div className="space-y-1.5">
        <Label htmlFor="photo">รูปภาพ (ถ้ามี)</Label>
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="preview" className="w-full max-h-48 object-contain rounded-lg border" />
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute top-2 right-2 bg-white rounded-full p-1 shadow border hover:bg-red-50"
            >
              <X className="size-4 text-red-500" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="photo"
            className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
          >
            <Upload className="size-5" />
            <span className="text-xs">คลิกเพื่ออัปโหลดรูป</span>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setPreview(f ? URL.createObjectURL(f) : null)
              }}
            />
          </label>
        )}
      </div>

      {state?.message && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200">
          {state.message}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (
          <><Loader2 className="size-4 animate-spin mr-2" />กำลังบันทึก...</>
        ) : (
          'บันทึกการแจ้งซ่อม'
        )}
      </Button>
    </form>
  )
}
