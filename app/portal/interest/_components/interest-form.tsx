'use client'

import { useActionState } from 'react'
import { submitLead } from '@/app/actions/leads'
import { CheckCircle2, Loader2, Phone, User, FileText } from 'lucide-react'

export function InterestForm() {
  const [state, action, pending] = useActionState(submitLead, undefined)

  if (state?.success) {
    return (
      <div className="rounded-2xl bg-white px-6 py-10 shadow-sm text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="size-8 text-emerald-500" />
          </div>
        </div>
        <p className="font-bold text-slate-800 text-lg">ส่งข้อมูลเรียบร้อยแล้ว</p>
        <p className="text-sm text-slate-500">{state.message}</p>
      </div>
    )
  }

  return (
    <form action={action} className="rounded-2xl bg-white px-5 py-6 shadow-sm space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <User className="size-3.5 text-slate-400" /> ชื่อ-นามสกุล <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="เช่น สมชาย ใจดี"
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Phone className="size-3.5 text-slate-400" /> เบอร์โทรศัพท์ <span className="text-red-500">*</span>
        </label>
        <input
          name="phone"
          type="tel"
          required
          placeholder="08x-xxx-xxxx"
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
        />
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <FileText className="size-3.5 text-slate-400" /> หมายเหตุ (ไม่บังคับ)
        </label>
        <textarea
          name="note"
          rows={3}
          placeholder="เช่น ต้องการห้องคู่, งบ 3,000 บาท, ต้องการย้ายเข้าเดือนหน้า..."
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition resize-none"
        />
      </div>

      {state?.message && !state.success && (
        <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-sm text-red-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a3a6b] text-sm font-bold text-white shadow-sm disabled:opacity-50 active:opacity-90 transition"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        ฝากข้อมูลไว้
      </button>
    </form>
  )
}
