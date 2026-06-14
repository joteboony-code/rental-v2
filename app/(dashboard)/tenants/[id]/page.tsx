import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { ChevronLeft, Pencil, Phone, CreditCard, User, Home, FileText, Calendar, LogOut, Plus, Download } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'
import { ContractForm } from '../_components/contract-form'
import { TerminateContractButton } from '../_components/terminate-contract-button'
import { ContractDocuments } from './_components/contract-documents'
import { TenantDocuments } from './_components/tenant-documents'
import { LinePairCard } from './_components/line-pair-card'
import { SendAgreementButton } from './_components/send-agreement-button'
import { createContract } from '@/app/actions/tenants'
import { getTenantDocuments } from '@/app/actions/tenant-documents'

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tenant }, { data: availableRooms }, { data: contracts }] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', id).single(),
    supabase
      .from('rooms')
      .select('id, room_number, floor, monthly_rent, deposit')
      .eq('status', 'available')
      .order('room_number'),
    supabase
      .from('contracts')
      .select(`*, rooms ( room_number, floor )`)
      .eq('tenant_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!tenant) notFound()

  const documents = await getTenantDocuments(id)

  const activeContracts = contracts?.filter((c) => c.status === 'active') ?? []
  const activeContract  = activeContracts[0] ?? null
  const hasActiveContract = activeContracts.length > 0

  const boundCreateContract = async (state: Parameters<typeof createContract>[0], formData: FormData) => {
    'use server'
    return createContract(state, formData)
  }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div>
        <Link href="/tenants"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ผู้เช่าทั้งหมด
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="size-14 rounded-2xl bg-slate-950 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-slate-900/20">
              {tenant.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">{tenant.full_name}</h1>
              {hasActiveContract && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {activeContracts.map((c) => (
                    <p key={c.id} className="text-sm text-slate-500 flex items-center gap-1.5">
                      <Home className="size-3.5" />
                      ห้อง {c.rooms?.room_number}
                      {c.rooms?.room_number ? ` แถวที่ ${roomRow(c.rooms.room_number)}` : ''}
                    </p>
                  ))}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 ring-1 ring-violet-200">
                    <span className="size-1.5 rounded-full bg-violet-500" /> เช่าอยู่
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/tenants/${id}/edit`}
              className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5'}>
              <Pencil className="size-3.5" /> แก้ไขข้อมูล
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* ── Left: ข้อมูลผู้เช่า ── */}
        <div className="md:col-span-1 space-y-4">

          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">ข้อมูลส่วนตัว</p>
            <div className="space-y-3">
              <InfoRow icon={<Phone className="size-4 text-slate-400" />} label="เบอร์โทร" value={tenant.phone} />
              <InfoRow icon={<CreditCard className="size-4 text-slate-400" />} label="บัตรประชาชน" value={tenant.id_card} />
            </div>
          </div>

          {/* LINE Pairing */}
          <LinePairCard
            tenantId={id}
            lineUserId={tenant.line_user_id}
            lineDisplayName={tenant.line_display_name}
            linePictureUrl={tenant.line_picture_url}
          />

          {/* ผู้ติดต่อฉุกเฉิน */}
          {(tenant.emergency_contact || tenant.emergency_phone) && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">ผู้ติดต่อฉุกเฉิน</p>
              <div className="space-y-3">
                <InfoRow icon={<User className="size-4 text-slate-400" />} label="ชื่อ" value={tenant.emergency_contact} />
                <InfoRow icon={<Phone className="size-4 text-slate-400" />} label="เบอร์" value={tenant.emergency_phone} />
              </div>
            </div>
          )}

          {/* หมายเหตุ */}
          {tenant.note && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">หมายเหตุ</p>
              <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{tenant.note}</p>
            </div>
          )}

          {/* เอกสารสัญญา */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText className="size-3.5" /> รูปเอกสารสัญญาเช่า
            </p>
            <ContractDocuments
              tenantId={id}
              images={(tenant.contract_images as string[] | null) ?? []}
            />
          </div>

          {/* เอกสารแนบผู้เช่า */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText className="size-3.5" /> เอกสารแนบ
            </p>
            <TenantDocuments tenantId={id} documents={documents} />
          </div>
        </div>

        {/* ── Right: สัญญา ── */}
        <div className="md:col-span-2 space-y-4">

          {/* สัญญาปัจจุบัน (ทุกห้อง) */}
          {activeContracts.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="size-3.5" /> สัญญาปัจจุบัน
                </p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                  <Link href={`/tenants/${id}/checkout?contractId=${c.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-400 gap-1.5'}>
                    <LogOut className="size-3.5" /> ย้ายออก
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <ContractRow label="ห้อง" value={`${c.rooms?.room_number ?? '—'}${c.rooms?.room_number ? ` (แถวที่ ${roomRow(c.rooms.room_number)})` : ''}`} />
                <ContractRow label="ค่าเช่า" value={`฿${Number(c.monthly_rent).toLocaleString()}/เดือน`} />
                <ContractRow label="เงินมัดจำ" value={`฿${Number(c.deposit_paid).toLocaleString()}`} />
                <ContractRow label="วันเริ่มสัญญา" value={formatDate(c.start_date)} />
                {c.end_date && <ContractRow label="วันสิ้นสุด" value={formatDate(c.end_date)} />}
                {c.note && (
                  <div className="col-span-2 pt-1">
                    <p className="text-xs text-slate-400 mb-1">หมายเหตุ</p>
                    <p className="text-sm text-slate-700">{c.note}</p>
                  </div>
                )}
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                <SendAgreementButton
                  tenantId={id}
                  contractId={c.id}
                  agreementPdfUrl={(c as { agreement_pdf_url?: string | null }).agreement_pdf_url ?? null}
                  signedAt={(c as { signed_at?: string | null }).signed_at ?? null}
                  lineUserId={tenant.line_user_id}
                />
                <TerminateContractButton contractId={c.id} tenantId={id} />
              </div>
            </div>
          ))}

          {/* ดาวน์โหลดแบบฟอร์มสัญญา */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-rose-50 shrink-0">
                <FileText className="size-4 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">แบบฟอร์มสัญญาเช่า</p>
                <p className="text-xs text-slate-400">ดาวน์โหลด PDF สำหรับพิมพ์</p>
              </div>
            </div>
            <a
              href="/docs/rental-agreement.pdf"
              download="สัญญาเช่าห้องพัก.pdf"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm shrink-0"
            >
              <Download className="size-3.5" />
              ดาวน์โหลด
            </a>
          </div>

          {/* เพิ่มห้องใหม่ */}
          {availableRooms && availableRooms.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Plus className="size-3.5" /> {hasActiveContract ? 'เพิ่มห้องใหม่' : 'สร้างสัญญาเช่า'}
              </p>
              <ContractForm action={boundCreateContract} tenantId={id} availableRooms={availableRooms} />
            </div>
          ) : !hasActiveContract ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="text-center py-10 text-slate-400">
                <Home className="size-8 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">ไม่มีห้องว่างในขณะนี้</p>
                <Link href="/rooms/new"
                  className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' mt-4 rounded-xl border-slate-200'}>
                  เพิ่มห้องใหม่
                </Link>
              </div>
            </div>
          ) : null}

          {/* ประวัติสัญญา */}
          {contracts && contracts.filter((c) => c.status !== 'active').length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar className="size-3.5" /> ประวัติสัญญา
              </p>
              <div className="space-y-0">
                {contracts
                  .filter((c) => c.status !== 'active')
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0 text-sm">
                      <div>
                        <span className="font-medium text-slate-700">ห้อง {c.rooms?.room_number ?? '—'}</span>
                        <span className="text-slate-400 ml-2 text-xs">
                          {formatDate(c.start_date)} — {c.end_date ? formatDate(c.end_date) : 'ปัจจุบัน'}
                        </span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        c.status === 'terminated'
                          ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {c.status === 'terminated' ? 'ยกเลิก' : 'หมดอายุ'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className={`text-sm text-slate-700 ${mono ? 'font-mono text-xs break-all' : 'font-medium'}`}>
          {value || <span className="text-slate-300 font-normal">—</span>}
        </p>
      </div>
    </div>
  )
}

function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-semibold">{value}</p>
    </div>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}


