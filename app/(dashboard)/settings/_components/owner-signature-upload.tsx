'use client'

import { useRef, useState, useEffect, useTransition } from 'react'
import { CheckCircle2, AlertCircle, Upload, Loader2, Trash2, RotateCcw } from 'lucide-react'
import { uploadOwnerSignature } from '@/app/actions/agreement'

interface Props {
  currentUrl: string | null
}

export function OwnerSignatureUpload({ currentUrl }: Props) {
  const [url, setUrl]               = useState<string | null>(currentUrl)
  const [mode, setMode]             = useState<'view' | 'draw'>('view')
  const [isEmpty, setIsEmpty]       = useState(true)
  const [result, setResult]         = useState<{ success: boolean; message: string } | null>(null)
  const [isPending, startTrans]     = useTransition()

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const isDrawing  = useRef(false)
  const lastPos    = useRef<{ x: number; y: number } | null>(null)

  // Reset canvas every time pad opens
  useEffect(() => {
    if (mode !== 'draw') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    setResult(null)
  }, [mode])

  function getPos(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) {
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawing.current = true
    lastPos.current   = getPos(e, canvas)
    setIsEmpty(false)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!isDrawing.current || !lastPos.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)

    ctx.beginPath()
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  function stopDraw() {
    isDrawing.current = false
    lastPos.current   = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    setResult(null)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || isEmpty) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const fd = new FormData()
      fd.append('signature', new File([blob], 'owner_signature.png', { type: 'image/png' }))
      setResult(null)
      startTrans(async () => {
        const res = await uploadOwnerSignature(fd)
        setResult(res)
        if (res.success && res.url) {
          setUrl(res.url)
          setMode('view')
        }
      })
    }, 'image/png')
  }

  /* ── View mode ── */
  if (mode === 'view') {
    return (
      <div className="space-y-3">
        {url ? (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url} alt="ลายเซ็นเจ้าของ"
              className="h-12 object-contain rounded px-2"
              style={{ background: 'repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%) 0 0 / 12px 12px' }}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-700">ลายเซ็นปัจจุบัน</p>
              <p className="text-xs text-slate-400">ฝังในสัญญาเช่าอัตโนมัติ</p>
            </div>
            <button
              type="button"
              onClick={() => setMode('draw')}
              className="text-xs text-slate-400 hover:text-slate-700 transition flex items-center gap-1"
            >
              <Trash2 className="size-3" /> เปลี่ยน
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMode('draw')}
            className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:bg-indigo-50/40 transition text-slate-500 text-xs"
          >
            <Upload className="size-5 text-slate-400" />
            คลิกเพื่อเซ็นลายเซ็น
          </button>
        )}
      </div>
    )
  }

  /* ── Draw mode ── */
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        {/* toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">เซ็นในกรอบด้านล่าง</p>
          <button
            type="button"
            onClick={clearCanvas}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition"
          >
            <RotateCcw className="size-3" /> ล้าง
          </button>
        </div>

        {/* canvas */}
        <canvas
          ref={canvasRef}
          width={800}
          height={240}
          className="w-full touch-none cursor-crosshair"
          style={{ background: 'repeating-conic-gradient(#f8fafc 0% 25%, white 0% 50%) 0 0 / 16px 16px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>

      {/* actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('view')}
          className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty || isPending}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
          บันทึกลายเซ็น
        </button>
      </div>

      {result && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-600 border border-rose-100'
        }`}>
          {result.success ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
          {result.message}
        </div>
      )}
    </div>
  )
}
