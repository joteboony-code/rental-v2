'use client'

import { useState, useTransition } from 'react'
import { updateLeadAnnouncement } from '@/app/actions/leads'
import { Megaphone, Check, Loader2, Pencil, X } from 'lucide-react'

export function AnnouncementEditor({ initial }: { initial: string | null }) {
  const [editing, setEditing]   = useState(false)
  const [text, setText]         = useState(initial ?? '')
  const [saved, setSaved]       = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateLeadAnnouncement(text)
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  function handleCancel() {
    setText(initial ?? '')
    setEditing(false)
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-violet-700 uppercase tracking-widest">
          <Megaphone className="size-3.5" /> ข้อความบนหน้าฟอร์ม
        </p>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1 text-[11px] font-semibold text-violet-600 hover:bg-violet-100 transition"
          >
            <Pencil className="size-3" /> แก้ไข
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="เช่น ตอนนี้มีห้องว่าง 2 ห้อง ราคา 3,500 บาท ติดต่อสอบถามได้เลย..."
            className="w-full rounded-xl border border-violet-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition"
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              บันทึก
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition"
            >
              <X className="size-3.5" /> ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div>
          {text ? (
            <p className="text-sm text-violet-800 whitespace-pre-wrap leading-relaxed">{text}</p>
          ) : (
            <p className="text-sm text-violet-400 italic">ยังไม่มีข้อความ — กด "แก้ไข" เพื่อเพิ่ม</p>
          )}
          {saved && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 font-semibold">
              <Check className="size-3" /> บันทึกแล้ว
            </p>
          )}
        </div>
      )}
    </div>
  )
}
