import Link from 'next/link'
import { ChevronLeft, Eye } from 'lucide-react'
import { TenantPortal } from '@/app/portal/_components/tenant-portal'

export default async function AdminPortalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/rooms"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ChevronLeft className="size-4" /> กลับหน้าห้อง
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200">
            <Eye className="size-3.5" /> โหมดผู้ดูแล
          </span>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
          หน้านี้เป็นตัวอย่าง Portal ที่ผู้เช่าเห็น คุณสามารถดูข้อมูลได้ แต่ไม่สามารถส่งแจ้งซ่อมแทนผู้เช่า
        </div>

        <TenantPortal adminPreview initialRoomId={id} />
      </div>
    </div>
  )
}
