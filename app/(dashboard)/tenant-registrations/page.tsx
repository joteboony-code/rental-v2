import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { RegistrationRequest } from '@/app/actions/registrations'
import { RegistrationActions } from './_components/registration-actions'
import { ClipboardList, UserPlus } from 'lucide-react'

export default async function TenantRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { status: statusFilter } = await searchParams
  const serviceSupabase = createServiceClient()

  // ดึงทั้งหมดไว้นับ count แยก + ดึงที่ filter ไว้แสดง
  let filteredQuery = serviceSupabase
    .from('tenant_registration_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (statusFilter && statusFilter !== 'all') {
    filteredQuery = filteredQuery.eq('status', statusFilter)
  }

  const [{ data: filteredRequests }, { data: allRequests }] = await Promise.all([
    filteredQuery,
    serviceSupabase.from('tenant_registration_requests').select('id, status'),
  ])

  const allCounts = (allRequests ?? []) as { id: string; status: string }[]
  const filtered = (filteredRequests ?? []) as RegistrationRequest[]

  // Sort filtered: pending first
  const sorted = [
    ...filtered.filter(r => r.status === 'pending'),
    ...filtered.filter(r => r.status !== 'pending'),
  ]

  const pendingCount = allCounts.filter(r => r.status === 'pending').length
  const tabs = [
    { value: 'all',      label: 'ทั้งหมด',     count: allCounts.length },
    { value: 'pending',  label: 'รอตรวจ',      count: pendingCount },
    { value: 'approved', label: 'อนุมัติแล้ว', count: allCounts.filter(r => r.status === 'approved' || r.status === 'auto_approved').length },
    { value: 'rejected', label: 'ปฏิเสธ',      count: allCounts.filter(r => r.status === 'rejected').length },
  ]

  const current = statusFilter ?? 'all'

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight flex items-center gap-2">
            <UserPlus className="size-7" />
            ลงทะเบียนผู้เช่า
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            คำขอลงทะเบียนจากผู้เช่า {pendingCount > 0 && <span className="font-semibold text-amber-600">({pendingCount} รอตรวจ)</span>}
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <a
            key={tab.value}
            href={tab.value === 'all' ? '/tenant-registrations' : `/tenant-registrations?status=${tab.value}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              current === tab.value
                ? 'bg-slate-950 text-white border-slate-950'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                current === tab.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <ClipboardList className="size-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">ไม่มีคำขอลงทะเบียน</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(req => (
            <RegistrationCard key={req.id} req={req} />
          ))}
        </div>
      )}
    </div>
  )
}

function RegistrationCard({ req }: { req: RegistrationRequest }) {
  const statusCfg = {
    pending:      { label: 'รอตรวจ',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    approved:     { label: 'อนุมัติแล้ว', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    auto_approved:{ label: 'อนุมัติอัตโนมัติ', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    rejected:     { label: 'ปฏิเสธ',      cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  }[req.status] ?? { label: req.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {req.line_picture_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={req.line_picture_url} alt="" className="size-11 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="size-11 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
              {req.full_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-800">{req.full_name}</p>
            <p className="text-xs text-slate-500">{req.phone}</p>
            {req.line_display_name && (
              <p className="text-xs text-emerald-600">LINE: {req.line_display_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-xl shrink-0">ห้อง {req.room_number}</span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {req.id_card && (
          <div><p className="text-slate-400">เลขบัตร</p><p className="font-medium text-slate-700">{req.id_card}</p></div>
        )}
        {req.move_in_date && (
          <div><p className="text-slate-400">วันเข้าอยู่</p><p className="font-medium text-slate-700">{new Date(req.move_in_date).toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'numeric'})}</p></div>
        )}
        <div><p className="text-slate-400">วันที่ส่งคำขอ</p><p className="font-medium text-slate-700">{new Date(req.created_at).toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p></div>
        {req.reviewed_at && (
          <div><p className="text-slate-400">วันที่ตรวจ</p><p className="font-medium text-slate-700">{new Date(req.reviewed_at).toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'numeric'})}</p></div>
        )}
      </div>

      {req.pending_reason && (
        <p className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
          ⚠️ เหตุผลรอตรวจ: {req.pending_reason}
        </p>
      )}

      {req.note && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">หมายเหตุ: {req.note}</p>
      )}

      {req.admin_note && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">หมายเหตุ admin: {req.admin_note}</p>
      )}

      {req.status === 'pending' && (
        <RegistrationActions requestId={req.id} />
      )}
    </div>
  )
}
