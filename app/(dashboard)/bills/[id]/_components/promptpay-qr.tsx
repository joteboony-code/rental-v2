'use client'

import QRCode from 'react-qr-code'
import { generatePromptPayPayload } from '@/lib/promptpay'
import { QrCode, Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface Props {
  promptpayId:   string
  promptpayName: string
  amount:        number
}

export function PromptPayQR({ promptpayId, promptpayName, amount }: Props) {
  const [copied, setCopied] = useState(false)

  if (!promptpayId) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400 border-2 border-dashed rounded-xl">
        <QrCode className="size-10 mb-3 text-gray-300" />
        <p className="text-sm">ยังไม่ได้ตั้งค่าเบอร์ PromptPay</p>
        <a href="/settings" className="text-xs text-blue-500 hover:underline mt-1">
          ตั้งค่า →
        </a>
      </div>
    )
  }

  const payload = generatePromptPayPayload(promptpayId, amount)

  function handleCopy() {
    navigator.clipboard.writeText(promptpayId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Keep at least four clear QR modules around the code. The 20px white
          quiet zone also prevents dark cards from confusing older scanners. */}
      <div className="shrink-0 rounded-xl border bg-white p-5 shadow-sm">
        <QRCode
          value={payload}
          size={200}
          level="H"
          className="block size-[200px] shrink-0"
          style={{ shapeRendering: 'crispEdges' }}
        />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-gray-800">{promptpayName}</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors mx-auto"
        >
          {copied ? (
            <Check className="size-3.5 text-green-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {promptpayId}
        </button>
        <p className="text-lg font-bold text-blue-700">
          ฿{amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
        </p>
      </div>

      <p className="text-xs text-gray-400 text-center">
        สแกน QR หรือโอนเข้าเบอร์ PromptPay ด้านบน
      </p>
    </div>
  )
}

