'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileText, Loader2, RotateCcw } from 'lucide-react'
import { getSignAgreementData, submitSignedAgreement, type AgreementData } from '@/app/actions/agreement'
import { AgreementTemplate } from './agreement-template'
import type { LiffClient } from '@/lib/liff-types'

declare global { interface Window { liff?: LiffClient } }

interface Props {
  contractId: string
  liffId: string | null
}

type Status = 'loading' | 'form' | 'preview' | 'submitting' | 'done' | 'error'

export function SignAgreementClient({ contractId, liffId }: Props) {
  const [lineUserId, setLineUserId]   = useState('')
  const [scriptReady, setScriptReady] = useState(false)
  const [status, setStatus]           = useState<Status>(contractId ? 'loading' : 'error')
  const [loadMsg, setLoadMsg]         = useState(liffId ? 'กำลังเชื่อมต่อ LINE...' : 'กำลังโหลด...')
  const [errorMsg, setErrorMsg]       = useState(contractId ? '' : 'ไม่พบข้อมูลสัญญา')
  const [data, setData]               = useState<AgreementData | null>(null)
  const [idCard, setIdCard]           = useState('')
  const [address, setAddress]         = useState('')
  const [sigDataUrl, setSigDataUrl]   = useState<string | null>(null)
  const [pdfUrl, setPdfUrl]           = useState<string | null>(null)

  const sigCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef   = useRef<{ x: number; y: number } | null>(null)

  // Init LIFF
  useEffect(() => {
    if (!liffId || !scriptReady) return
    window.liff?.init({ liffId }).then(async () => {
      if (!window.liff?.isLoggedIn()) { window.liff?.login(); return }
      const profile = await window.liff?.getProfile()
      setLineUserId(profile?.userId ?? '')
    }).catch(() => setLoadMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ LINE'))
  }, [liffId, scriptReady])

  // Load data เมื่อมี lineUserId
  useEffect(() => {
    if (!contractId) return // error state already set from initial props
    const uid = lineUserId || (liffId ? '' : 'test')
    if (!uid) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time loading message before async fetch
    setLoadMsg('กำลังโหลดข้อมูลสัญญา...')
    getSignAgreementData(uid, contractId).then((res) => {
      if (!res.success) { setStatus('error'); setErrorMsg(res.message); return }
      setData(res.data)
      setIdCard(res.data.tenant.id_card ?? '')
      setAddress(res.data.tenant.address ?? '')
      if (res.data.contract.signed_at && res.data.contract.agreement_pdf_url) {
        setPdfUrl(res.data.contract.agreement_pdf_url)
        setStatus('done')
      } else {
        setStatus('form')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineUserId, contractId])

  // Signature canvas helpers
  function getPos(e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const canvas = sigCanvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    lastPosRef.current = getPos(e, canvas)
  }

  function draw(e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!isDrawingRef.current) return
    const canvas = sigCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !lastPosRef.current) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPosRef.current = pos
  }

  function endDraw() { isDrawingRef.current = false; lastPosRef.current = null }

  function clearSig() {
    const canvas = sigCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSigDataUrl(null)
  }

  function isCanvasBlank() {
    const canvas = sigCanvasRef.current
    if (!canvas) return true
    const ctx = canvas.getContext('2d')
    if (!ctx) return true
    return !ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)
  }

  const handlePreview = useCallback(() => {
    if (isCanvasBlank()) { alert('กรุณาลงลายเซ็นก่อน'); return }
    const url = sigCanvasRef.current?.toDataURL('image/png') ?? null
    setSigDataUrl(url)
    setStatus('preview')
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!data || !sigDataUrl || !lineUserId) return
    setStatus('submitting')
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      const el = document.getElementById('agreement-template')
      if (!el) throw new Error('template element not found')

      const canvas = await html2canvas(el, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
        // html2canvas 1.x doesn't support oklch/lab (Tailwind v4 default) — strip
        // all external stylesheets from the clone; template is 100% inline-styled.
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((s) => s.remove())
        },
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgH = pageW * (canvas.height / canvas.width)

      // แบ่งเนื้อหาเป็นหลายหน้า A4 ถ้ายาวเกิน 1 หน้า (กันลายเซ็นโดนตัด)
      let position = 0
      let heightLeft = imgH
      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
      heightLeft -= pageH
      while (heightLeft > 2) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
        heightLeft -= pageH
      }

      const pdfBlob = pdf.output('blob')
      const pdfFile = new File([pdfBlob], 'agreement.pdf', { type: 'application/pdf' })
      const fd = new FormData()
      fd.append('lineUserId', lineUserId)
      fd.append('contractId', data.contract.id)
      fd.append('id_card', idCard)
      fd.append('address', address)
      fd.append('pdf', pdfFile)

      const res = await submitSignedAgreement(fd)
      if (!res.success) { setStatus('error'); setErrorMsg(res.message); return }
      setPdfUrl(res.pdfUrl ?? null)
      setStatus('done')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    }
  }, [data, sigDataUrl, lineUserId, idCard, address])

  return (
    <>
      {/* LIFF SDK — ต้องอยู่นอก status blocks เพื่อโหลดได้ตั้งแต่แรก */}
      {liffId && (
        <Script
          src="https://static.line-scdn.net/liff/edge/2/sdk.js"
          onReady={() => setScriptReady(true)}
        />
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4 py-20 text-slate-500">
          <Loader2 className="size-8 animate-spin text-slate-400" />
          <p className="text-sm">{loadMsg}</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-6 text-center">
          <AlertCircle className="size-8 mx-auto text-rose-400 mb-3" />
          <p className="text-sm font-semibold text-rose-700 mb-1">เกิดข้อผิดพลาด</p>
          <p className="text-xs text-rose-600">{errorMsg}</p>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center space-y-4">
          <CheckCircle2 className="size-12 mx-auto text-emerald-500" />
          <div>
            <h2 className="text-lg font-bold text-emerald-800 mb-1">ลงนามสัญญาเรียบร้อยแล้ว</h2>
            <p className="text-sm text-emerald-700">สัญญาเช่าถูกบันทึกในระบบแล้ว</p>
          </div>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition">
              <Download className="size-4" /> ดาวน์โหลด PDF สัญญา
            </a>
          )}
        </div>
      )}

      {/* Submitting */}
      {status === 'submitting' && (
        <div className="flex flex-col items-center gap-4 py-20 text-slate-500">
          <Loader2 className="size-8 animate-spin text-slate-400" />
          <p className="text-sm">กำลังสร้าง PDF และบันทึกสัญญา...</p>
          <p className="text-xs text-slate-400">กรุณารอสักครู่</p>
        </div>
      )}

      {/* Preview */}
      {status === 'preview' && data && sigDataUrl && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">ตรวจสอบสัญญาก่อนยืนยัน</p>
            <p className="text-xs text-amber-700">กรุณาอ่านสัญญาให้ครบถ้วน แล้วกด &quot;ยืนยันและลงนาม&quot;</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div style={{ transformOrigin: 'top left', transform: 'scale(0.45)', width: '794px', pointerEvents: 'none' }}>
              <AgreementTemplate data={data} signatureDataUrl={sigDataUrl} idCard={idCard} address={address} signedDate={new Date()} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStatus('form')}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              <RotateCcw className="size-4" /> แก้ไข
            </button>
            <button onClick={handleSubmit}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0C1B4D] py-3 text-sm font-semibold text-white hover:bg-slate-800 transition">
              <FileText className="size-4" /> ยืนยันและลงนาม
            </button>
          </div>
        </div>
      )}

      {/* Hidden full-size template for html2canvas — ต้องอยู่ใน DOM ตอน preview และ submitting */}
      {(status === 'preview' || status === 'submitting') && data && sigDataUrl && (
        <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', zIndex: -1 }}>
          <AgreementTemplate data={data} signatureDataUrl={sigDataUrl} idCard={idCard} address={address} signedDate={new Date()} />
        </div>
      )}

      {/* Form */}
      {status === 'form' && data && (
        <div className="space-y-5">
          {/* ข้อมูลสัญญา */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">รายละเอียดสัญญา</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-slate-400">ห้อง</p>
                <p className="font-semibold text-slate-800">{data.contract.room?.room_number ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">ค่าเช่า</p>
                <p className="font-semibold text-slate-800">฿{data.contract.monthly_rent.toLocaleString()}/เดือน</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">เงินประกัน</p>
                <p className="font-semibold text-slate-800">฿{data.contract.deposit_paid.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">วันเริ่มสัญญา</p>
                <p className="font-semibold text-slate-800">
                  {new Date(data.contract.start_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          {/* กรอกข้อมูลเพิ่ม */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ข้อมูลส่วนตัวผู้เช่า</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">เลขบัตรประชาชน</label>
              <input type="text" value={idCard} onChange={(e) => setIdCard(e.target.value)}
                placeholder="1-xxxx-xxxxx-xx-x" maxLength={17}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0C1B4D]/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">ที่อยู่ปัจจุบัน</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="บ้านเลขที่ / หมู่ / ถนน / ตำบล / อำเภอ / จังหวัด" rows={2}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0C1B4D]/30 resize-none" />
            </div>
          </div>

          {/* Signature pad */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ลายเซ็นผู้เช่า</p>
              <button type="button" onClick={clearSig}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition">
                <RotateCcw className="size-3" /> ล้าง
              </button>
            </div>
            <p className="text-xs text-slate-400">วาดลายเซ็นในกรอบด้านล่าง</p>
            <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 overflow-hidden touch-none select-none">
              <canvas ref={sigCanvasRef} width={600} height={180} className="w-full"
                style={{ touchAction: 'none', cursor: 'crosshair' }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            </div>
          </div>

          <button onClick={handlePreview}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0C1B4D] py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition">
            <FileText className="size-4" /> ดูตัวอย่างสัญญา
          </button>
        </div>
      )}
    </>
  )
}
