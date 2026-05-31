'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  roomNumber: string
  tenantName: string
  monthLabel: string
  rentAmount: number
  waterAmount: number
  waterUnits?: number
  electricityAmount: number
  electricityUnits?: number
  otherAmount: number
  otherNote?: string | null
  totalAmount: number
  dueDate: string
}

export function CopyBillButton({
  roomNumber, tenantName, monthLabel,
  rentAmount, waterAmount, waterUnits,
  electricityAmount, electricityUnits,
  otherAmount, otherNote,
  totalAmount, dueDate,
}: Props) {
  const [copied, setCopied] = useState(false)

  const buildText = () => {
    const lines = [
      `📋 บิลค่าเช่าห้อง ${roomNumber}`,
      `ประจำเดือน ${monthLabel}`,
      `ผู้เช่า: ${tenantName}`,
      ``,
      `ค่าเช่า: ฿${rentAmount.toLocaleString('th-TH')}`,
    ]
    if (waterAmount > 0) {
      lines.push(`ค่าน้ำ: ฿${waterAmount.toLocaleString('th-TH')}${waterUnits ? ` (${waterUnits} หน่วย)` : ''}`)
    }
    if (electricityAmount > 0) {
      lines.push(`ค่าไฟ: ฿${electricityAmount.toLocaleString('th-TH')}${electricityUnits ? ` (${electricityUnits} หน่วย)` : ''}`)
    }
    if (otherAmount > 0) {
      lines.push(`อื่นๆ${otherNote ? ` (${otherNote})` : ''}: ฿${otherAmount.toLocaleString('th-TH')}`)
    }
    lines.push(``)
    lines.push(`💰 รวมทั้งหมด: ฿${totalAmount.toLocaleString('th-TH')}`)
    lines.push(`📅 ครบกำหนด: ${new Date(dueDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`)
    return lines.join('\n')
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-500" />
          คัดลอกแล้ว
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          คัดลอกสรุป
        </>
      )}
    </button>
  )
}
