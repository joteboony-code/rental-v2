import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChevronLeft, LogOut, User, Home, Calendar } from 'lucide-react'
import { roomRow } from '@/lib/room-utils'

export default async function MoveOutHistoryPage() {
  const supabase = await createClient()

  const { data: contracts } = await supabase
    .from('contracts')
    .select(`
      id, start_date, end_date, monthly_rent, deposit_paid, status, created_at,
      rooms   ( room_number, floor ),
      tenants ( id, full_name, phone )
    `)
    .eq('status', 'terminated')
    .order('end_date', { ascending: false })

  type RJ = { room_number: string; floor: number | null }
  type TJ = { id: string; full_name: string; phone: string | null }

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <Link href="/tenants"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ผู้เช่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
            <LogOut className="size-5 text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">รายงาน</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ประวัติการย้ายออก</h1>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
        <p className="text-xs text-slate-400 mb-1">ผู้เช่าที่ย้ายออกทั้งหมด</p>
        <p className="text-3xl font-bold text-slate-950">{contracts?.length ?? 0} <span className="text-sm font-normal text-slate-400">ราย</span></p>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {!contracts || contracts.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <LogOut className="size-8 mx-auto mb-3 text-slate-300" />
            <p>ยังไม่มีประวัติการย้ายออก</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {contracts.map((c) => {
              const room   = c.rooms   as unknown as RJ | null
              const tenant = c.tenants as unknown as TJ | null
              return (
                <div key={c.id} className="px-5 py-4 flex items-start gap-4">
                  {/* Avatar */}
                  <div className="size-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                    <LogOut className="size-4 text-rose-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Link href={`/tenants/${tenant?.id}`}
                        className="font-semibold text-slate-800 hover:text-slate-950 flex items-center gap-1.5">
                        <User className="size-3.5 text-slate-400" />
                        {tenant?.full_name ?? '—'}
                      </Link>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="size-3" />
                        ย้ายออก {c.end_date
                          ? new Date(c.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                      {room && (
                        <span className="flex items-center gap-1">
                          <Home className="size-3 text-slate-400" />
                          ห้อง {room.room_number} แถวที่ {roomRow(room.room_number)}
                        </span>
                      )}
                      <span>เช่า {new Date(c.start_date).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })} — {c.end_date ? new Date(c.end_date).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }) : 'ปัจจุบัน'}</span>
                      <span className="font-semibold text-slate-700">฿{Number(c.monthly_rent).toLocaleString()}/เดือน</span>
                      {Number(c.deposit_paid) > 0 && (
                        <span className="text-slate-400">มัดจำ ฿{Number(c.deposit_paid).toLocaleString()}</span>
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


