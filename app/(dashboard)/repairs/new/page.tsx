import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createRepair } from '@/app/actions/repairs'
import { RepairForm } from '../_components/repair-form'

export default async function NewRepairPage() {
  const supabase = await createClient()

  const [{ data: rooms }, { data: tenants }] = await Promise.all([
    supabase.from('rooms').select('id, room_number, floor').order('room_number'),
    supabase.from('tenants').select('id, full_name').order('full_name'),
  ])

  return (
    <div className="p-5 md:p-8 max-w-2xl space-y-6">
      <div>
        <Link href="/repairs"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> แจ้งซ่อมทั้งหมด
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">เพิ่มใหม่</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">แจ้งซ่อมใหม่</h1>
        <p className="text-sm text-slate-500 mt-1">บันทึกรายการซ่อมบำรุงเพื่อติดตาม</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6">
        <RepairForm
          action={createRepair}
          rooms={rooms ?? []}
          tenants={tenants ?? []}
        />
      </div>
    </div>
  )
}

