'use client'

import { useState, useRef, useTransition } from 'react'
import { uploadContractImages, deleteContractImage } from '@/app/actions/tenants'
import { Upload, X, Loader2, FileImage, Check, AlertCircle } from 'lucide-react'

interface Props {
  tenantId: string
  documents: Array<{ storedValue: string; url: string }>
}

export function ContractDocuments({ tenantId, documents: initial }: Props) {
  const [documents, setDocuments] = useState(initial)
  const [pending, startTrans] = useTransition()
  const [result,  setResult]  = useState<{ success: boolean; message: string } | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPreviews(files.map((f) => URL.createObjectURL(f)))
  }

  function handleUpload() {
    if (!fileRef.current?.files?.length) return
    const fd = new FormData()
    Array.from(fileRef.current.files).forEach((f) => fd.append('contract_images', f))
    setResult(null)
    startTrans(async () => {
      const res = await uploadContractImages(tenantId, fd)
      setResult(res)
      if (res.success && res.documents) {
        setDocuments((prev) => [...prev, ...res.documents!])
        setPreviews([])
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  function handleDelete(storedValue: string) {
    startTrans(async () => {
      await deleteContractImage(tenantId, storedValue)
      setDocuments((prev) => prev.filter((item) => item.storedValue !== storedValue))
    })
  }

  return (
    <div className="space-y-4">

      {/* Existing images */}
      {documents.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {documents.map((document, i) => (
            <div key={document.storedValue} className="relative group rounded-xl overflow-hidden border border-slate-100 aspect-[3/4] bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={document.url} alt={`สัญญา ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
              <button
                type="button"
                onClick={() => handleDelete(document.storedValue)}
                disabled={pending}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition bg-white rounded-full p-1 shadow hover:bg-red-50"
              >
                <X className="size-3.5 text-red-500" />
              </button>
              <a
                href={document.url}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition text-xs font-medium bg-white/90 text-slate-700 px-2 py-0.5 rounded-lg"
              >
                ดูเต็ม
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      <div className="space-y-3">
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p} alt="" className="rounded-lg aspect-[3/4] object-cover border border-violet-200 w-full" />
            ))}
          </div>
        )}

        <label
          htmlFor="contract_images_input"
          className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer text-slate-400 hover:border-violet-300 hover:text-violet-400 transition-colors"
        >
          <FileImage className="size-5" />
          <span className="text-xs text-center">
            คลิกเพื่อเลือกรูปเอกสารสัญญา<br />
            <span className="text-slate-300">เลือกได้หลายรูปพร้อมกัน</span>
          </span>
          <input
            ref={fileRef}
            id="contract_images_input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        {previews.length > 0 && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-950 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60"
          >
            {pending
              ? <><Loader2 className="size-4 animate-spin" /> กำลังอัพโหลด...</>
              : <><Upload className="size-4" /> อัพโหลด {previews.length} ไฟล์</>}
          </button>
        )}

        {result && (
          <div className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl ${
            result.success
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-rose-50 text-rose-600 border border-rose-100'
          }`}>
            {result.success ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
            {result.message}
          </div>
        )}
      </div>
    </div>
  )
}
