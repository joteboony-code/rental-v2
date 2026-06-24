'use client'

import { useEffect, useRef } from 'react'
import QRCodeStyling from 'qr-code-styling'

interface Props {
  value: string
  size?: number
}

export function StyledQR({ value, size = 220 }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    const qr = new QRCodeStyling({
      width: size,
      height: size,
      data: value,
      margin: 8,
      dotsOptions: {
        color: '#0f172a',
        type: 'extra-rounded',
      },
      cornersSquareOptions: {
        color: '#0f172a',
        type: 'extra-rounded',
      },
      cornersDotOptions: {
        color: '#0f172a',
        type: 'dot',
      },
      backgroundOptions: {
        color: '#ffffff',
      },
      qrOptions: {
        errorCorrectionLevel: 'M',
      },
    })
    ref.current.innerHTML = ''
    qr.append(ref.current)
  }, [value, size])

  return (
    <div className="flex items-center justify-center rounded-3xl bg-slate-950 p-5 shadow-xl">
      <div
        ref={ref}
        className="rounded-2xl overflow-hidden"
        style={{ width: size, height: size }}
      />
    </div>
  )
}
