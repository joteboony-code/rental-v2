'use client'

import QRCode from 'react-qr-code'
import { Check, Copy, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type RoomPairQrButtonProps = {
  roomNumber: string
  pairUrl: string
}

export function RoomPairQrButton({ roomNumber, pairUrl }: RoomPairQrButtonProps) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(pairUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
            title={`QR ห้อง ${roomNumber}`}
          />
        }
      >
        <QrCode className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR จับคู่ห้อง {roomNumber}</DialogTitle>
          <DialogDescription>
            ให้ผู้เช่าสแกน QR เพื่อเพิ่มเพื่อน LINE OA จากนั้นส่งรหัสจับคู่ 6 หลักที่ได้จากหน้าข้อมูลผู้เช่า
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-center rounded-xl bg-white p-4 ring-1 ring-slate-100">
            <QRCode
              value={pairUrl}
              size={208}
              className="h-auto w-full max-w-[208px]"
              viewBox="0 0 256 256"
            />
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="break-all text-center text-[11px] leading-relaxed text-slate-500">
              {pairUrl}
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
      </DialogContent>
    </Dialog>
  )
}
