'use client'

import { useRef, useState, useTransition } from 'react'
import { CheckCircle2, AlertCircle, Upload, Loader2, PenLine, Trash2 } from 'lucide-react'
import { uploadOwnerSignature } from '@/app/actions/agreement'

interface Props {
  currentUrl: string | null
}

export function OwnerSignatureUpload({ currentUrl }: Props) {
  const [url, setUrl]             = useState<string | null>(currentUrl)
  const [preview, setPreview]     = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult]       = useState<{ success: boolean; message: string } | null>(null)
  const [isPending, startTrans]   = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
    setResult(null)
  }

  function handleUpload() {
    if (!selectedFile) return
    const fd = new FormData()
    fd.append('signature', selectedFile)
    setResult(null)
    startTrans(async () => {
      const res = await uploadOwnerSignature(fd)
      setResult(res)
      if (res.success && res.url) {
        setUrl(res.url)
        setPreview(null)
        setSelectedFile(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* แสดงลายเซ็นปัจจุบัน */}
      {url && !preview && (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="ลายเซ็นเจ้าของ" className="h-12 object-contain bg-white rounded border border-slate-200 px-2" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-700">ลายเซ็นปัจจุบัน</p>
            <p className="text-xs text-slate-400">ฝังในสัญญาเช่าอัตโนมัติ</p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs text-slate-400 hover:text-slate-700 transition flex items-center gap-1"
          >
            <Trash2 className="size-3" /> เปลี่ยน
          </button>
        </div>
      )}

      {/* Preview ก่อน upload */}
      {preview && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview" className="h-12 object-contain bg-white rounded border border-slate-200 px-2" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-indigo-700">พร้อมอัพโหลด</p>
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
            บันทึก
          </button>
        </div>
      )}

      {/* Upload button */}
      {!url && !preview && (
        <label className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition">
          <PenLine className="size-5 text-slate-400" />
          <p className="text-xs text-slate-500 text-center">
            คลิกเพื่อเลือกรูปลายเซ็น<br />
            <span className="text-slate-400">PNG/JPG พื้นหลังขาวหรือโปร่งใส</span>
          </p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      )}

      {url && !preview && (
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      )}

      {result && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-600 border border-rose-100'
        }`}>
          {result.success ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
          {result.message}
        </div>
      )}
    </div>
  )
}
