import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createTenant } from '@/app/actions/tenants'
import { TenantForm } from '../_components/tenant-form'

export default function NewTenantPage() {
  return (
    <div className="p-5 md:p-8 max-w-2xl space-y-6">
      <div>
        <Link href="/tenants"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ผู้เช่าทั้งหมด
        </Link>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">เพิ่มใหม่</p>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">เพิ่มผู้เช่า</h1>
        <p className="text-sm text-slate-500 mt-1">กรอกข้อมูลผู้เช่า หลังจากนั้นสามารถสร้างสัญญาเช่าได้ในหน้าถัดไป</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6">
        <TenantForm action={createTenant} submitLabel="เพิ่มผู้เช่า" />
      </div>
    </div>
  )
}

