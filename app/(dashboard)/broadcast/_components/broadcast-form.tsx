'use client'

import { useState, useTransition, useRef } from 'react'
import { sendBroadcast } from '@/app/actions/line'
import { uploadBroadcastImage } from '@/app/actions/upload'
import { Megaphone, Loader2, Check, AlertCircle, Users, Wifi, Rows3, ListChecks, ImagePlus, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface RoomInfo {
  room_id:     string
  room_number: string
  tenant_name: string
  has_line:    boolean
  row:         number | null
  uses_wifi:   boolean
}

interface Props {
  rooms: RoomInfo[]
}

type TargetMode = 'all' | 'wifi' | 'rows' | 'rooms'

const ROOM_ROWS = [1, 2, 3] as const

export function BroadcastForm({ rooms }: Props) {
  const [pending, start]        = useTransition()
  const [uploading, startUpload] = useTransition()
  const [message, setMessage]   = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [uploadError, setUploadError]   = useState('')
  const [targetMode, setTargetMode] = useState<TargetMode>('all')
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result,  setResult]   = useState<{ success: boolean; sent: number; failed: number; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    const preview = URL.createObjectURL(file)
    setImagePreview(preview)
    const fd = new FormData()
    fd.set('file', file)
    startUpload(async () => {
      const res = await uploadBroadcastImage(fd)
      if (res.success && res.url) {
        setImageUrl(res.url)
      } else {
        setUploadError(res.message)
        setImagePreview('')
        setImageUrl('')
      }
    })
  }

  function removeImage() {
    setImageUrl('')
    setImagePreview('')
    setUploadError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const lineRooms = rooms.filter((r) => r.has_line)
  const wifiRooms = lineRooms.filter((r) => r.uses_wifi)
  const targetRooms = lineRooms.filter((r) => {
    if (targetMode === 'all') return true
    if (targetMode === 'wifi') return r.uses_wifi
    if (targetMode === 'rows') return r.row !== null && selectedRows.has(r.row)
    return selected.has(r.room_id)
  })
  const recipientCount = targetRooms.length

  function selectTargetMode(mode: TargetMode) {
    setTargetMode(mode)
    setSelectedRows(new Set())
    setSelected(new Set())
  }

  function toggleRow(row: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(row)) next.delete(row); else next.add(row)
      return next
    })
  }

  function toggleRoom(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function send() {
    if (!message.trim()) return
    const roomIds = targetMode === 'all' ? [] : targetRooms.map((room) => room.room_id)
    start(async () => {
      const res = await sendBroadcast(roomIds, message.trim(), imageUrl.trim() || null)
      setResult(res)
      if (res.success) {
        setMessage('')
        setImageUrl('')
      }
    })
  }

  return (
    <div className="space-y-5">

      {/* Target selection */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">เลือกผู้รับ</p>

        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { mode: 'all', label: 'ส่งทุกห้อง', detail: `${lineRooms.length} ห้องที่มี LINE`, icon: Users },
            { mode: 'wifi', label: 'เฉพาะห้องที่ใช้ WiFi', detail: `${wifiRooms.length} ห้องที่มี LINE`, icon: Wifi },
            { mode: 'rows', label: 'เลือกตามแถว', detail: 'แถว 1, 2 หรือ 3', icon: Rows3 },
            { mode: 'rooms', label: 'เลือกห้องเอง', detail: 'เลือกได้หลายห้อง', icon: ListChecks },
          ] as const).map(({ mode, label, detail, icon: Icon }) => (
            <label
              key={mode}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
                targetMode === mode
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-slate-200 text-slate-600 hover:border-violet-200'
              }`}
            >
              <input
                type="radio"
                name="broadcast_target"
                value={mode}
                checked={targetMode === mode}
                onChange={() => selectTargetMode(mode)}
                className="size-4 accent-violet-600"
              />
              <Icon className="size-4 shrink-0 text-violet-500" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs opacity-70">{detail}</span>
              </span>
            </label>
          ))}
        </div>

        {targetMode === 'rows' && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {ROOM_ROWS.map((row) => {
              const count = lineRooms.filter((room) => room.row === row).length
              return (
                <label
                  key={row}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    selectedRows.has(row)
                      ? 'border-violet-300 bg-violet-50 font-semibold text-violet-700'
                      : 'border-slate-200 text-slate-600 hover:border-violet-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedRows.has(row)}
                    onChange={() => toggleRow(row)}
                    className="size-3.5 accent-violet-600"
                  />
                  แถว {row} ({count})
                </label>
              )
            })}
          </div>
        )}

        {/* Per-room selection */}
        {targetMode === 'rooms' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            {rooms.map((r) => (
              <label
                key={r.room_id}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all text-sm ${
                  !r.has_line
                    ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                    : selected.has(r.room_id)
                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                    : 'border-slate-200 hover:border-violet-200 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!r.has_line}
                  checked={selected.has(r.room_id)}
                  onChange={() => toggleRoom(r.room_id)}
                  className="size-3.5 accent-violet-600"
                />
                <div className="min-w-0">
                  <p className="font-semibold truncate">ห้อง {r.room_number}</p>
                  <p className="text-xs truncate opacity-70">{r.has_line ? r.tenant_name : 'ไม่มี LINE'}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        {recipientCount > 0 && (
          <p className="text-xs text-violet-600 font-medium">
            จะส่งถึง {recipientCount} ห้อง
          </p>
        )}
      </div>

      {/* Message */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ข้อความประกาศ</p>

        <div className="space-y-1.5">
          <Label htmlFor="broadcast_msg">ข้อความ <span className="text-rose-500">*</span></Label>
          <Textarea
            id="broadcast_msg"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="พิมพ์ข้อความที่ต้องการประกาศ..."
            className="resize-none"
          />
          <p className="text-xs text-slate-400 text-right">{message.length} ตัวอักษร</p>
        </div>

        <div className="space-y-2">
          <Label>รูปภาพ (ถ้ามี)</Label>
          {imagePreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="preview" className="h-32 rounded-xl object-cover border border-slate-200" />
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                  <Loader2 className="size-5 text-white animate-spin" />
                </div>
              )}
              {!uploading && (
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 size-5 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-rose-500 transition-colors"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-violet-400 hover:text-violet-600 transition-colors"
            >
              <ImagePlus className="size-4" />
              เลือกรูปภาพ
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}
          <p className="text-xs text-slate-400">รูปภาพจะแสดงหลังข้อความ รองรับ jpg/png/webp (max 5MB)</p>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-2xl ${
          result.success
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {result.success ? <Check className="size-4 shrink-0 mt-0.5" /> : <AlertCircle className="size-4 shrink-0 mt-0.5" />}
          <div>
            <p className="font-semibold">{result.message}</p>
            {result.success && result.failed > 0 && (
              <p className="text-xs mt-0.5 opacity-70">
                ส่งไม่ได้ {result.failed} ห้อง (token ผิดหรือ LINE ไม่รองรับ)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Send button */}
      <button
        type="button"
        onClick={send}
        disabled={pending || !message.trim() || recipientCount === 0}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-all shadow-md shadow-violet-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending
          ? <><Loader2 className="size-4 animate-spin" /> กำลังส่ง...</>
          : <><Megaphone className="size-4" /> ส่งประกาศ {recipientCount > 0 ? `(${recipientCount} ห้อง)` : ''}</>}
      </button>
    </div>
  )
}
