'use client'

import { useState } from 'react'
import { Copy, Check, QrCode } from 'lucide-react'

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const url = `${window.location.origin}/portal/interest`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition"
    >
      {copied ? (
        <><Check className="size-3.5 text-emerald-500" /> คัดลอกลิงก์แล้ว</>
      ) : (
        <><Copy className="size-3.5" /> คัดลอกลิงก์ฟอร์ม</>
      )}
    </button>
  )
}
