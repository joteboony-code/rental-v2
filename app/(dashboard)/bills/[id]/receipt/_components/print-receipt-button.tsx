'use client'

import { Printer } from 'lucide-react'

export function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
    >
      <Printer className="size-4" />
      พิมพ์ใบเสร็จ
    </button>
  )
}
