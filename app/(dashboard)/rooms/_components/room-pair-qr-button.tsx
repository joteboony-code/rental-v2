'use client'

import { Check, Copy, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StyledQR } from '@/components/ui/styled-qr'
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
  /** Registration URL (/portal/register?token=...) — preferred */
  registrationUrl?: string
  /** Legacy LIFF pairing URL — kept for backward compat, not shown by default */
  pairUrl?: string
}

function isAbsoluteUrl(url?: string) {
  return !!url && /^https?:\/\//i.test(url)
}

export function RoomPairQrButton({ roomNumber, registrationUrl, pairUrl }: RoomPairQrButtonProps) {
  const [copied, setCopied] = useState(false)

  const displayUrl = registrationUrl || pairUrl || ''
  const isValid = isAbsoluteUrl(displayUrl)

  async function copyLink() {
    if (!navigator.clipboard || !displayUrl) return
    await navigator.clipboard.writeText(displayUrl)
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
          <DialogTitle>QR ลงทะเบียนผู้เช่า ห้อง {roomNumber}</DialogTitle>
          <DialogDescription>
            ให้ผู้เช่าสแกนเพื่อกรอกข้อมูลและจับคู่ LINE กับห้อง
          </DialogDescription>
        </DialogHeader>

        {!isValid ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800">ยังไม่มีลิงก์ลงทะเบียน</p>
            <p className="text-xs text-amber-700">
              กรุณาเข้าหน้ารายละเอียดห้องเพื่อสร้างลิงก์ลงทะเบียน
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              <StyledQR value={displayUrl} size={220} />
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="break-all text-center text-[11px] leading-relaxed text-slate-500">
                {displayUrl}
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
        )}
      </DialogContent>
    </Dialog>
  )
}
