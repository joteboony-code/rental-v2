'use client'

import { useState, useTransition } from 'react'
import { sendBroadcast } from '@/app/actions/line'
import { Megaphone, MessageCircle, Loader2, Check, AlertCircle, Users, Home } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface RoomInfo {
  room_id:     string
  room_number: string
  tenant_name: string
  has_line:    boolean
}

interface Props {
  rooms: RoomInfo[]
}

export function BroadcastForm({ rooms }: Props) {
  const [pending, start]      = useTransition()
  const [message, setMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [allRooms, setAllRooms] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result,  setResult]  = useState<{ success: boolean; sent: number; failed: number; message: string } | null>(null)

  const lineRooms     = rooms.filter((r) => r.has_line)
  const targetRooms   = allRooms ? lineRooms : lineRooms.filter((r) => selected.has(r.room_id))
  const recipientCount = targetRooms.length

  function toggleRoom(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function send() {
    if (!message.trim()) return
    const roomIds = allRooms ? [] : Array.from(selected)
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

        {/* All rooms toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={allRooms}
            onChange={(e) => { setAllRooms(e.target.checked); setSelected(new Set()) }}
            className="size-4 accent-violet-600 rounded"
          />
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Users className="size-4 text-violet-500" />
            ส่งทุกห้อง ({lineRooms.length} ห้องที่มี LINE)
          </span>
        </label>

        {/* Per-room selection */}
        {!allRooms && (
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

        <div className="space-y-1.5">
          <Label htmlFor="broadcast_img">URL รูปภาพ (ถ้ามี)</Label>
          <Input
            id="broadcast_img"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
          <p className="text-xs text-slate-400">รูปภาพจะแสดงหลังข้อความ รองรับ jpg/png</p>
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
