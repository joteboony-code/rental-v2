'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createExpense } from '@/app/actions/expenses'

type Room = { id: string; room_number: string }

type ActionState = { success: boolean; message: string } | undefined

const CATEGORY_OPTIONS = [
  { value: 'maintenance',  label: 'ซ่อมบำรุง' },
  { value: 'utility',      label: 'สาธารณูปโภค' },
  { value: 'common_area',  label: 'พื้นที่ส่วนกลาง' },
  { value: 'salary',       label: 'เงินเดือน' },
  { value: 'other',        label: 'อื่นๆ' },
]

async function createExpenseAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const category     = formData.get('category') as string
  const description  = formData.get('description') as string
  const amount       = parseFloat(formData.get('amount') as string)
  const expense_date = formData.get('expense_date') as string
  const room_id      = formData.get('room_id') as string | null
  const note         = formData.get('note') as string | null

  if (!category || !description || isNaN(amount) || !expense_date) {
    return { success: false, message: 'กรุณากรอกข้อมูลให้ครบ' }
  }

  return createExpense({ category, description, amount, expense_date, room_id, note })
}

export function ExpenseForm({ rooms }: { rooms: Room[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState(createExpenseAction, undefined)

  useEffect(() => {
    if (state?.success) {
      router.refresh()
      formRef.current?.reset()
    }
  }, [state, router])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">เพิ่มค่าใช้จ่าย</h2>
      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <div className="space-y-1">
            <label htmlFor="category" className="text-xs font-medium text-slate-600">
              ประเภท <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              name="category"
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">-- เลือกประเภท --</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label htmlFor="expense_date" className="text-xs font-medium text-slate-600">
              วันที่ <span className="text-red-500">*</span>
            </label>
            <input
              id="expense_date"
              name="expense_date"
              type="date"
              required
              defaultValue={today}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Description */}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="description" className="text-xs font-medium text-slate-600">
              รายการ <span className="text-red-500">*</span>
            </label>
            <input
              id="description"
              name="description"
              type="text"
              required
              placeholder="อธิบายรายการค่าใช้จ่าย"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label htmlFor="amount" className="text-xs font-medium text-slate-600">
              จำนวนเงิน (บาท) <span className="text-red-500">*</span>
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Room (optional) */}
          <div className="space-y-1">
            <label htmlFor="room_id" className="text-xs font-medium text-slate-600">
              ห้อง (ถ้ามี)
            </label>
            <select
              id="room_id"
              name="room_id"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">-- ไม่ระบุห้อง --</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>ห้อง {r.room_number}</option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="note" className="text-xs font-medium text-slate-600">หมายเหตุ</label>
            <input
              id="note"
              name="note"
              type="text"
              placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {state && !state.success && (
          <div className="rounded-xl px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200">
            {state.message}
          </div>
        )}
        {state?.success && (
          <div className="rounded-xl px-4 py-3 text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
            {state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
        >
          {isPending ? <><Loader2 className="size-4 animate-spin" /> กำลังบันทึก...</> : 'บันทึก'}
        </button>
      </form>
    </div>
  )
}
