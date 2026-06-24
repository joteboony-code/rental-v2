'use client'

import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StyledQR } from '@/components/ui/styled-qr'

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
      <div className="flex justify-center">
        <StyledQR value={value} size={220} />
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

