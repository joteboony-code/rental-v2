'use client'

import QRCode from 'react-qr-code'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type PairQrCodeProps = {
  value: string
}

export function PairQrCode({ value }: PairQrCodeProps) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center rounded-xl bg-white p-3 ring-1 ring-slate-100">
        <QRCode
          value={value}
          size={184}
          className="h-auto w-full max-w-[184px]"
          viewBox="0 0 256 256"
        />
      </div>
      <div className="rounded-lg bg-slate-50 px-3 py-2">
        <p className="break-all text-center text-[11px] leading-relaxed text-slate-500">
          {value}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full gap-2"
        onClick={copyLink}
      >
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
      </Button>
    </div>
  )
}
