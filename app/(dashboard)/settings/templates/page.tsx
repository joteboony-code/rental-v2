import Link from 'next/link'
import { ChevronLeft, MessageSquareText } from 'lucide-react'
import { getTemplates } from '@/app/actions/templates'
import { TemplateEditor } from './_components/template-editor'

export default async function TemplatesPage() {
  const templates = await getTemplates()

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">

      <div>
        <Link href="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-700 mb-5 transition-colors">
          <ChevronLeft className="size-3.5" /> ตั้งค่า
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-green-100 flex items-center justify-center shrink-0">
            <MessageSquareText className="size-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">LINE</p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-950 tracking-tight">ข้อความ LINE</h1>
          </div>
        </div>
      </div>

      {/* Variable help */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">ตัวแปรที่ใช้ได้ (พิมพ์ในข้อความได้เลย):</p>
        <div className="flex flex-wrap gap-1.5">
          {['{room_number}', '{tenant_name}', '{billing_month}', '{total_amount}', '{paid_amount}', '{remaining_amount}', '{due_date}', '{promise_date}', '{portal_url}'].map((v) => (
            <code key={v} className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 font-mono">{v}</code>
          ))}
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-12 text-center text-slate-400 text-sm">
          ยังไม่มี template — กรุณารัน SQL line_message_templates.sql ก่อน
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateEditor key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  )
}
