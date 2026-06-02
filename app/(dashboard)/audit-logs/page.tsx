import Link from 'next/link'
import { History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAuditLogs, type AuditFilters } from '@/app/actions/audit'
import { AuditFilterBar } from './_components/audit-filter-bar'

export const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  bill_update:         { label: 'แก้บิล',           color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  bill_delete:         { label: 'ลบบิล',            color: 'bg-rose-50 text-rose-700 ring-rose-200' },
  payment_create:      { label: 'บันทึกชำระเงิน',   color: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  payment_delete:      { label: 'ลบการชำระเงิน',    color: 'bg-rose-50 text-rose-700 ring-rose-200' },
  slip_approve:        { label: 'อนุมัติสลิป',      color: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  slip_reject:         { label: 'ปฏิเสธสลิป',       color: 'bg-rose-50 text-rose-700 ring-rose-200' },
  tenant_checkout:     { label: 'ย้ายออก',          color: 'bg-orange-50 text-orange-700 ring-orange-200' },
  deposit_refund:      { label: 'คืนเงินประกัน',    color: 'bg-sky-50 text-sky-700 ring-sky-200' },
  tenant_update:       { label: 'แก้ข้อมูลผู้เช่า', color: 'bg-violet-50 text-violet-700 ring-violet-200' },
  line_mapping_change: { label: 'เปลี่ยน LINE',     color: 'bg-teal-50 text-teal-700 ring-teal-200' },
  document_upload:     { label: 'อัพโหลดเอกสาร',    color: 'bg-slate-100 text-slate-600 ring-slate-200' },
  document_delete:     { label: 'ลบเอกสาร',         color: 'bg-rose-50 text-rose-700 ring-rose-200' },
}

const dateTimeFmt = (s: string) =>
  new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; tenant?: string; room?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const filters: AuditFilters = {
    action:   sp.action || undefined,
    tenantId: sp.tenant || undefined,
    roomId:   sp.room || undefined,
    from:     sp.from ? new Date(sp.from).toISOString() : undefined,
    to:       sp.to ? new Date(`${sp.to}T23:59:59`).toISOString() : undefined,
  }

  const supabase = await createClient()
  const [logs, { data: rooms }, { data: tenants }] = await Promise.all([
    getAuditLogs(filters),
    supabase.from('rooms').select('id, room_number').order('room_number'),
    supabase.from('tenants').select('id, full_name').order('full_name'),
  ])

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-md shadow-slate-900/20">
          <History className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ประวัติการกระทำ</h1>
          <p className="text-sm text-slate-400">บันทึกการแก้ไขสำคัญในระบบ</p>
        </div>
      </div>

      <AuditFilterBar
        rooms={(rooms ?? []) as { id: string; room_number: string }[]}
        tenants={(tenants ?? []) as { id: string; full_name: string }[]}
        actionLabels={Object.fromEntries(Object.entries(ACTION_LABELS).map(([k, v]) => [k, v.label]))}
        current={{ action: sp.action ?? '', tenant: sp.tenant ?? '', room: sp.room ?? '', from: sp.from ?? '', to: sp.to ?? '' }}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <History className="size-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">ไม่พบประวัติการกระทำตามเงื่อนไข</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map((log) => {
              const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-slate-100 text-slate-600 ring-slate-200' }
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${meta.color}`}>
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{log.description || '—'}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                      <span>{dateTimeFmt(log.created_at)}</span>
                      {log.rooms?.room_number && <span>ห้อง {log.rooms.room_number}</span>}
                      {log.tenants?.full_name && (
                        log.tenant_id
                          ? <Link href={`/tenants/${log.tenant_id}`} className="hover:text-slate-700 hover:underline">{log.tenants.full_name}</Link>
                          : <span>{log.tenants.full_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
