'use client'

import { useState, useRef, useTransition } from 'react'
import { uploadTenantDocument, deleteTenantDocument } from '@/app/actions/tenant-documents'
import { DOCUMENT_TYPE_LABELS, type TenantDocument, type DocumentType } from '@/lib/tenant-documents'
import { Upload, X, Loader2, FileText, Image as ImageIcon, ExternalLink, Check, AlertCircle, Trash2 } from 'lucide-react'

interface Props {
  tenantId: string
  documents: TenantDocument[]
}

const isImage = (name: string | null, url: string) =>
  /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name ?? '') || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(url)

const dateFmt = (s: string) =>
  new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

export function TenantDocuments({ tenantId, documents: initial }: Props) {
  const [docs, setDocs] = useState<TenantDocument[]>(initial)
  const [pending, startTrans] = useTransition()
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [docType, setDocType] = useState<DocumentType>('id_card')
  const [fileName, setFileName] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_type', docType)
    setResult(null)
    startTrans(async () => {
      const res = await uploadTenantDocument(tenantId, fd)
      setResult({ success: res.success, message: res.message })
      if (res.success && res.document) {
        setDocs((prev) => [res.document!, ...prev])
        setFileName('')
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('ลบเอกสารนี้ใช่หรือไม่?')) return
    startTrans(async () => {
      const res = await deleteTenantDocument(id)
      if (res.success) setDocs((prev) => prev.filter((d) => d.id !== id))
      else setResult({ success: false, message: res.message })
    })
  }

  return (
    <div className="space-y-4">

      {/* รายการเอกสาร */}
      {docs.length > 0 ? (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-100">
                {isImage(d.file_name, d.file_url)
                  ? <ImageIcon className="size-4 text-violet-500" />
                  : <FileText className="size-4 text-rose-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700 truncate">
                  {DOCUMENT_TYPE_LABELS[d.document_type] ?? d.document_type}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {d.file_name || '—'} · {dateFmt(d.created_at)}
                </p>
              </div>
              <a
                href={d.file_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"
                title="เปิดดู/ดาวน์โหลด"
              >
                <ExternalLink className="size-3.5" />
              </a>
              <button
                type="button"
                onClick={() => handleDelete(d.id)}
                disabled={pending}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors disabled:opacity-50"
                title="ลบ"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-300 text-center py-2">ยังไม่มีเอกสารแนบ</p>
      )}

      {/* อัพโหลดเอกสารใหม่ */}
      <div className="space-y-2.5 pt-1">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentType)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-violet-300 focus:outline-none"
        >
          {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => (
            <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
          ))}
        </select>

        <label
          htmlFor="tenant_doc_input"
          className="flex flex-col items-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer text-slate-400 hover:border-violet-300 hover:text-violet-400 transition-colors"
        >
          <Upload className="size-5" />
          <span className="text-xs text-center">
            {fileName ? <span className="text-slate-600 font-medium break-all">{fileName}</span> : 'คลิกเพื่อเลือกไฟล์'}<br />
            <span className="text-slate-300">รองรับรูปภาพและ PDF</span>
          </span>
          <input
            ref={fileRef}
            id="tenant_doc_input"
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </label>

        {fileName && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-950 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60"
          >
            {pending
              ? <><Loader2 className="size-4 animate-spin" /> กำลังอัพโหลด...</>
              : <><Upload className="size-4" /> อัพโหลดเอกสาร</>}
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
