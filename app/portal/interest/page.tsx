export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/service'
import { InterestForm } from './_components/interest-form'
import { Megaphone } from 'lucide-react'

export default async function InterestPage() {
  const supabase = createServiceClient()

  // ดึง settings + นับ view พร้อมกัน
  const { data: settings } = await supabase
    .from('settings')
    .select('lead_announcement, interest_view_count')
    .eq('id', 1)
    .single()

  // increment view count (fire-and-forget, ไม่ block render)
  const currentCount = (settings as { interest_view_count?: number } | null)?.interest_view_count ?? 0
  void supabase
    .from('settings')
    .update({ interest_view_count: currentCount + 1 })
    .eq('id', 1)

  const announcement = (settings as { lead_announcement?: string | null } | null)?.lead_announcement ?? null

  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="bg-[#0C1B4D] px-5 pt-14 pb-8">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">ห้องพัก</p>
          <h1 className="text-2xl font-bold text-white">ฝากชื่อสนใจเช่าห้อง</h1>
          <p className="text-sm text-slate-300 mt-1">กรอกข้อมูลไว้ เจ้าของหอจะติดต่อกลับเมื่อมีห้องว่าง</p>
        </div>
      </div>
      <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
        {announcement && (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4 flex gap-3">
            <Megaphone className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 whitespace-pre-wrap leading-relaxed">{announcement}</p>
          </div>
        )}
        <InterestForm />
      </div>
    </main>
  )
}
