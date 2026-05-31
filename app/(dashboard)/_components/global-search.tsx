'use client'

import { useRef, useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Search, Loader2, User, Home } from 'lucide-react'
import { searchAction, type SearchResult } from '@/app/actions/search'

const statusLabel: Record<string, string> = {
  available: 'ว่าง', occupied: 'มีผู้เช่า', maintenance: 'ซ่อม',
}
const statusColor: Record<string, string> = {
  available: 'text-emerald-600', occupied: 'text-indigo-600', maintenance: 'text-amber-600',
}

export function GlobalSearch() {
  const [query, setQuery]     = useState('')
  const [result, setResult]   = useState<SearchResult | null>(null)
  const [open, setOpen]       = useState(false)
  const [, startTransition]   = useTransition()
  const [loading, setLoading] = useState(false)
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(val: string) {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim()) { setResult(null); setOpen(false); return }
    setLoading(true)
    setOpen(true)
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchAction(val)
        setResult(res)
        setLoading(false)
      })
    }, 280)
  }

  const hasResults = result && (result.tenants.length > 0 || result.rooms.length > 0)

  return (
    <div ref={wrapRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query && setOpen(true)}
          placeholder="ค้นหาผู้เช่า, ห้อง..."
          className="w-full h-8 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-colors"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3 animate-spin text-slate-400" />}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {!hasResults && !loading && (
            <p className="px-4 py-3 text-xs text-slate-400 text-center">ไม่พบผลลัพธ์</p>
          )}

          {result && result.tenants.length > 0 && (
            <div>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ผู้เช่า</p>
              {result.tenants.map((t) => (
                <Link
                  key={t.id}
                  href={`/tenants/${t.id}`}
                  onClick={() => { setOpen(false); setQuery('') }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="size-6 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <User className="size-3 text-violet-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-700">{t.full_name}</span>
                </Link>
              ))}
            </div>
          )}

          {result && result.rooms.length > 0 && (
            <div className="border-t border-slate-50">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ห้อง</p>
              {result.rooms.map((r) => (
                <Link
                  key={r.id}
                  href={`/rooms`}
                  onClick={() => { setOpen(false); setQuery('') }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="size-6 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                    <Home className="size-3 text-sky-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-700">ห้อง {r.room_number}</span>
                  <span className={`ml-auto text-[10px] font-semibold ${statusColor[r.status] ?? 'text-slate-400'}`}>
                    {statusLabel[r.status] ?? r.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
