export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/service'
import { InterestForm } from './_components/interest-form'
import { Images, Megaphone } from 'lucide-react'

export default async function InterestPage() {
  const supabase = createServiceClient()

  // Await an atomic increment so Cloudflare cannot end the request before it is saved.
  const [{ data: settings }] = await Promise.all([
    supabase
      .from('settings')
      .select('lead_announcement, interest_gallery_paths')
      .eq('id', 1)
      .single(),
    supabase.rpc('increment_interest_view_count'),
  ])

  const announcement = (settings as { lead_announcement?: string | null } | null)?.lead_announcement ?? null
  const galleryPaths = (settings as { interest_gallery_paths?: string[] | null } | null)?.interest_gallery_paths ?? []
  const galleryUrls = galleryPaths.map(
    (path) => supabase.storage.from('interest-room-photos').getPublicUrl(path).data.publicUrl
  )

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
        {galleryUrls.length > 0 && (
          <section className="rounded-2xl bg-white p-3 shadow-sm" aria-labelledby="room-gallery-title">
            <div className="mb-3 flex items-center gap-2 px-1">
              <Images className="size-4 text-[#1a3a6b]" />
              <h2 id="room-gallery-title" className="text-sm font-bold text-slate-800">รูปห้องพัก</h2>
              <span className="ml-auto text-xs text-slate-400">{galleryUrls.length} รูป</span>
            </div>
            <div className={`grid gap-2 ${galleryUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {galleryUrls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={`group relative overflow-hidden rounded-xl bg-slate-100 ${galleryUrls.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}
                  aria-label={`เปิดรูปห้องพักรูปที่ ${index + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`รูปห้องพัก ${index + 1}`}
                    className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    loading={index > 1 ? 'lazy' : 'eager'}
                  />
                </a>
              ))}
            </div>
            <p className="mt-2 px-1 text-[11px] text-slate-400">แตะที่รูปเพื่อดูภาพขนาดเต็ม</p>
          </section>
        )}
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
