'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  rooms:        { id: string; room_number: string }[]
  tenants:      { id: string; full_name: string }[]
  actionLabels: Record<string, string>
  current:      { action: string; tenant: string; room: string; from: string; to: string }
}

export function AuditFilterBar({ rooms, tenants, actionLabels, current }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const push = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }, [router, sp])

  const clearAll = () => router.push('?')

  const hasFilters = Object.values(current).some(Boolean)

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* ประเภทการกระทำ */}
      <select
        value={current.action}
        onChange={(e) => push('action', e.target.value)}
        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-violet-300 focus:outline-none"
      >
        <option value="">ทุกประเภท</option>
        {Object.entries(actionLabels).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      {/* ผู้เช่า */}
      <select
        value={current.tenant}
        onChange={(e) => push('tenant', e.target.value)}
        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-violet-300 focus:outline-none"
      >
        <option value="">ทุกผู้เช่า</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.full_name}</option>
        ))}
      </select>

      {/* ห้อง */}
      <select
        value={current.room}
        onChange={(e) => push('room', e.target.value)}
        className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-violet-300 focus:outline-none"
      >
        <option value="">ทุกห้อง</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>ห้อง {r.room_number}</option>
        ))}
      </select>

      {/* วันที่ */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={current.from}
          onChange={(e) => push('from', e.target.value)}
          className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-violet-300 focus:outline-none"
          placeholder="จากวันที่"
        />
        <span className="text-xs text-slate-300">—</span>
        <input
          type="date"
          value={current.to}
          onChange={(e) => push('to', e.target.value)}
          className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-violet-300 focus:outline-none"
          placeholder="ถึงวันที่"
        />
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <X className="size-3" /> ล้างตัวกรอง
        </button>
      )}

      <div className="ml-auto text-xs text-slate-400 flex items-center gap-1">
        <Search className="size-3" /> กรองแล้ว
      </div>
    </div>
  )
}
