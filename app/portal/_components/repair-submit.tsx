'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2, SendHorizonal, X } from 'lucide-react'
import { submitPortalRepair } from '@/app/actions/portal'

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'ไม่เร่งด่วน' },
  { value: 'normal', label: 'ปกติ' },
  { value: 'high',   label: 'เร่งด่วน' },
  { value: 'urgent', label: 'ด่วนมาก' },
]

type Props = { portalToken: string; roomId?: string; onSuccess: () => void }

export function RepairSubmit({ portalToken, roomId, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPreview(URL.createObjectURL(file))
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (photoFile) fd.set('photo', photoFile)
    setResult(null)
    startTransition(async () => {
      const res = await submitPortalRepair(portalToken, fd, roomId)
      setResult(res)
      if (res.success) {
        formRef.current?.reset()
        clearPhoto()
        onSuccess()
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">หัวข้อ <span className="text-rose-500">*</span></label>
        <input
          name="title"
          required
          placeholder="เช่น ก๊อกน้ำรั่ว, ไฟดับ, ประตูพัง..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-950/20"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">รายละเอียดเพิ่มเติม</label>
        <textarea
          name="description"
          rows={3}
          placeholder="อธิบายปัญหาเพิ่มเติม..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-950/20 resize-none"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">ระดับความเร่งด่วน</label>
        <select
          name="priority"
          defaultValue="normal"
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950/20"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Photo */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">รูปถ่าย</label>
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="preview" className="w-full max-h-48 object-cover rounded-xl border border-slate-200" />
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute top-2 right-2 size-7 rounded-full bg-black/50 flex items-center justify-center text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-sm font-medium text-slate-400 hover:border-slate-300 hover:bg-slate-100 transition-colors"
          >
            <Camera className="size-5" />
            ถ่ายรูป / เลือกรูปจากคลัง
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhoto}
        />
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {result.success ? '✅ ' : '⚠️ '}{result.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-bold text-white disabled:opacity-50 active:opacity-90"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
        {isPending ? 'กำลังส่ง...' : 'ส่งคำขอแจ้งซ่อม'}
      </button>
    </form>
  )
}
