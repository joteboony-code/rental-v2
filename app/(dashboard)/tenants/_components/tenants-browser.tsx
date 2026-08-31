'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Home, Phone, Users } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { SearchInput } from '@/components/ui/search-input'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { LineAvatar } from '@/components/line-avatar'

export type TenantRow = {
  id: string
  full_name: string
  phone: string | null
  linePictureUrl: string | null
  roomId: string | null
  roomNumber: string | null
  hasActiveContract: boolean
  portalOpened: boolean
  portalLabel: string
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/tenants/${t.id}`}
              className="group flex flex-col rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-200 overflow-hidden"
            >
              {/* Status strip */}
              <div className={`h-1 w-full ${t.hasActiveContract ? 'bg-violet-500' : 'bg-slate-300'}`} />

              <div className="flex flex-col gap-3 p-4 flex-1">
                <div className="flex items-start gap-3">
                  <LineAvatar name={t.full_name} pictureUrl={t.linePictureUrl} className="size-12 rounded-xl text-sm shrink-0" />
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
                  <ArrowRight className="size-4 shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>

                <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                  {t.hasActiveContract
                    ? <StatusBadge label="เช่าอยู่" tone="violet" />
                    : <StatusBadge label="ไม่มีสัญญา" tone="slate" />
                  }
                  {t.portalOpened
                    ? <StatusBadge label={t.portalLabel} tone="emerald" />
                    : <span className="text-[11px] font-medium text-slate-400">{t.portalLabel}</span>
                  }
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
