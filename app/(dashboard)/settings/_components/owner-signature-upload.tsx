'use client'

import { useRef, useState, useTransition } from 'react'
import { CheckCircle2, AlertCircle, Upload, Loader2, PenLine, Trash2 } from 'lucide-react'
import { uploadOwnerSignature } from '@/app/actions/agreement'

interface Props {
  currentUrl: string | null
}

// ลบพื้นหลังสีขาว/สีอ่อน → โปร่งใส ด้วย Canvas API
function removeWhiteBackground(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(objectUrl)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        // ถ้าสีใกล้ขาว (R>220, G>220, B>220) → โปร่งใส
        if (r > 220 && g > 220 && b > 220) {
          data[i + 3] = 0
        }
      }
      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return }
        resolve(new File([blob], 'owner_signature.png', { type: 'image/png' }))
      }, 'image/png')
    }
    img.onerror = () => resolve(file)
    img.src = objectUrl
  })
}

export function OwnerSignatureUpload({ currentUrl }: Props) {
  const [url, setUrl]                   = useState<string | null>(currentUrl)
  const [preview, setPreview]           = useState<string | null>(null)
  const [processedFile, setProcessedFile] = useState<File | null>(null)
  const [processing, setProcessing]     = useState(false)
  const [result, setResult]             = useState<{ success: boolean; message: string } | null>(null)
  const [isPending, startTrans]         = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setProcessing(true)
    try {
      const transparent = await removeWhiteBackground(file)
      const previewUrl = URL.createObjectURL(transparent)
      setProcessedFile(transparent)
      setPreview(previewUrl)
    } finally {
      setProcessing(false)
    }
  }

  function handleUpload() {
    if (!processedFile) return
    const fd = new FormData()
    fd.append('signature', processedFile)
    setResult(null)
    startTrans(async () => {
      const res = await uploadOwnerSignature(fd)
      setResult(res)
      if (res.success && res.url) {
        setUrl(res.url)
        setPreview(null)
        setProcessedFile(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  const busy = isPending || processing

  return (
    <div className="space-y-3">
      {/* ลายเซ็นปัจจุบัน */}
      {url && !preview && (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="ลายเซ็นเจ้าของ"
            className="h-12 object-contain rounded px-2"
            style={{ background: 'repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%) 0 0 / 12px 12px' }}
          />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-700">ลายเซ็นปัจจุบัน</p>
            <p className="text-xs text-slate-400">ฝังในสัญญาเช่าอัตโนมัติ</p>
          </div>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="text-xs text-slate-400 hover:text-slate-700 transition flex items-center gap-1">
            <Trash2 className="size-3" /> เปลี่ยน
          </button>
        </div>
      )}

      {/* Preview หลังลบพื้นหลัง */}
      {preview && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="preview"
            className="h-12 object-contain rounded px-2"
            style={{ background: 'repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%) 0 0 / 12px 12px' }}
          />
          <div className="flex-1">
            <p className="text-xs font-semibold text-indigo-700">
              {processing ? 'กำลังลบพื้นหลัง...' : 'พร้อมอัพโหลด (พื้นหลังโปร่งใสแล้ว)'}
            </p>
          </div>
          <button type="button" onClick={handleUpload} disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition">
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
            บันทึก
          </button>
        </div>
      )}

      {/* Upload area (ยังไม่มีลายเซ็น) */}
      {!url && !preview && (
        <label className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 transition">
          {processing
            ? <Loader2 className="size-5 text-indigo-400 animate-spin" />
            : <PenLine className="size-5 text-slate-400" />
          }
          <p className="text-xs text-slate-500 text-center">
            {processing ? 'กำลังลบพื้นหลัง...' : 'คลิกเพื่อเลือกรูปลายเซ็น'}
            <br />
            <span className="text-slate-400">ระบบลบพื้นหลังสีขาวให้อัตโนมัติ</span>
          </p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      )}

      {/* Hidden input เมื่อมี url แล้ว */}
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
