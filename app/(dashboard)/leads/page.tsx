export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { LeadActions } from './_components/lead-actions'
import { Users, QrCode, Copy } from 'lucide-react'
import { CopyLinkButton } from './_components/copy-link-button'

type Lead = {
  id: string
  name: string
  phone: string
  note: string | null
  status: 'new' | 'contacted' | 'converted' | 'dismissed'
  created_at: string
}

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function LeadsPage({ searchParams }: Props) {
  const { status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && ['new', 'contacted', 'converted', 'dismissed'].includes(status)) {
    query = query.eq('status', status)
  }

  const [{ data: leads }, { data: allLeads }] = await Promise.all([
    query,
    supabase.from('leads').select('status'),
  ])

  const counts = {
    all:       allLeads?.length ?? 0,
    new:       allLeads?.filter((l) => l.status === 'new').length ?? 0,
    contacted: allLeads?.filter((l) => l.status === 'contacted').length ?? 0,
    converted: allLeads?.filter((l) => l.status === 'converted').length ?? 0,
    dismissed: allLeads?.filter((l) => l.status === 'dismissed').length ?? 0,
  }

  const tabs = [
    { value: '',           label: 'ทั้งหมด',      count: counts.all       },
    { value: 'new',        label: 'ใหม่',          count: counts.new       },
    { value: 'contacted',  label: 'ติดต่อแล้ว',    count: counts.contacted },
    { value: 'converted',  label: 'เช่าแล้ว',      count: counts.converted },
    { value: 'dismissed',  label: 'ไม่สนใจ',       count: counts.dismissed },
  ]

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">รายชื่อ</p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">คนสนใจเช่าห้อง</h1>
        </div>
        <CopyLinkButton />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <a
            key={t.value}
            href={t.value ? `/leads?status=${t.value}` : '/leads'}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold border transition ${
              (status ?? '') === t.value
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                (status ?? '') === t.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {t.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* List */}
      {!leads || leads.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center">
          <Users className="size-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">ยังไม่มีรายชื่อ</p>
          <p className="text-xs text-slate-300 mt-1">แชร์ลิงก์ /portal/interest ให้คนสนใจกรอก</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white divide-y divide-slate-50 overflow-hidden">
          {(leads as Lead[]).map((lead) => (
            <div key={lead.id} className="px-5 py-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-800">{lead.name}</p>
                  <p className="text-sm text-slate-500">{lead.phone}</p>
                  {lead.note && (
                    <p className="text-xs text-slate-400 mt-0.5">{lead.note}</p>
                  )}
                </div>
                <p className="text-xs text-slate-300 shrink-0">
                  {new Date(lead.created_at).toLocaleDateString('th-TH', {
                    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <LeadActions id={lead.id} status={lead.status} phone={lead.phone} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
