'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Home, Phone, Users } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'

export type TenantRow = {
  id: string
  full_name: string
  phone: string | null
  roomId: string | null
  roomNumber: string | null
  hasActiveContract: boolean
  portalOpened: boolean
}

type Filter = 'all' | 'active' | 'inactive'

export function TenantsBrowser({ tenants }: { tenants: TenantRow[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => ({
    all: tenants.length,
    active: tenants.filter((t) => t.hasActiveContract).length,
    inactive: tenants.filter((t) => !t.hasActiveContract).length,
  }), [tenants])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tenants.filter((t) => {
      if (filter === 'active' && !t.hasActiveContract) return false
      if (filter === 'inactive' && t.hasActiveContract) return false
      if (!q) return true
      return (
        t.full_name.toLowerCase().includes(q) ||
        (t.phone ?? '').toLowerCase().includes(q) ||
        (t.roomNumber ?? '').toLowerCase().includes(q)
      )
    })
  }, [tenants, query, filter])

  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: 'all',      label: 'ทั้งหมด',     count: counts.all },
    { value: 'active',   label: 'กำลังเช่า',   count: counts.active },
    { value: 'inactive', label: 'ไม่มีสัญญา', count: counts.inactive },
  ]

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาชื่อผู้เช่า เลขห้อง หรือเบอร์โทร"
      />

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(({ value, label, count }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              filter === value
                ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
              filter === value ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="ไม่พบผู้เช่า"
          description={query ? `ไม่มีผลลัพธ์สำหรับ "${query}"` : 'ลองเปลี่ยนตัวกรอง หรือเพิ่มผู้เช่าใหม่'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/tenants/${t.id}`}
              className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                  {t.full_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.full_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    {t.roomNumber && (
                      <span className="flex items-center gap-1">
                        <Home className="size-3" /> ห้อง {t.roomNumber} · แถวที่ {roomRow(t.roomNumber)}
                      </span>
                    )}
                    {t.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {t.phone}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-slate-300" />
              </div>

              <div className="flex items-center gap-2 border-t border-slate-50 pt-3">
                {t.hasActiveContract
                  ? <StatusBadge label="เช่าอยู่" tone="violet" />
                  : <StatusBadge label="ไม่มีสัญญา" tone="slate" />
                }
                {t.portalOpened
                  ? <StatusBadge label="เปิด Portal แล้ว" tone="emerald" />
                  : <span className="text-[11px] font-medium text-slate-300">ยังไม่เปิด Portal</span>
                }
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
