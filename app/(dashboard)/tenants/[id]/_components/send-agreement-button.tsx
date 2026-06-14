'use client'

import { useState, useTransition } from 'react'
import { Send, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { sendAgreementLinkToTenant } from '@/app/actions/agreement'

interface Props {
  tenantId: string
  contractId: string
  agreementPdfUrl: string | null
  signedAt: string | null
  lineUserId: string | null
}

export function SendAgreementButton({ tenantId, contractId, agreementPdfUrl, signedAt, lineUserId }: Props) {
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSend() {
    setResult(null)
    startTransition(async () => {
      const res = await sendAgreementLinkToTenant(tenantId, contractId)
      setResult(res)
    })
  }

  if (signedAt && agreementPdfUrl) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-emerald-700">ลงนามสัญญาแล้ว</p>
          <p className="text-xs text-emerald-600">
            {new Date(signedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <a
          href={agreementPdfUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-emerald-700 underline underline-offset-2"
        >
          <ExternalLink className="size-3" /> PDF
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={isPending || !lineUserId}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isPending
          ? <><Loader2 className="size-4 animate-spin" /> กำลังส่ง...</>
          : <><Send className="size-4" /> ส่งลิงก์สัญญาทาง LINE</>
        }
      </button>

      {!lineUserId && (
        <p className="text-xs text-slate-400 text-center">ผู้เช่ายังไม่ได้จับคู่ LINE</p>
      )}

      {result && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-600 border border-rose-100'
        }`}>
          {result.success
            ? <CheckCircle2 className="size-3.5 shrink-0" />
            : <AlertCircle className="size-3.5 shrink-0" />
          }
          {result.message}
        </div>
      )}
    </div>
  )
}
