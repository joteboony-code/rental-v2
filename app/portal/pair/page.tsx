import { headers } from 'next/headers'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { normalizeOrigin } from '@/lib/pair-url'
import { PairForm } from './_components/pair-form'

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>
}) {
  const { room } = await searchParams
  const line = await getLineIntegrationPublic()
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = headerList.get('x-forwarded-proto') ?? 'https'
  const fallbackOrigin = host ? `${protocol}://${host}` : ''
  const appOrigin = normalizeOrigin(line?.app_url) || fallbackOrigin
  const addFriendUrl = line?.line_oa_basic_id
    ? `https://line.me/R/ti/p/${encodeURIComponent(line.line_oa_basic_id)}`
    : null

  return (
    <main className="min-h-dvh bg-slate-100">
      {/* Dark header banner */}
      <div className="bg-[#1a3a6b] px-4 pb-8 pt-10">
        <div className="mx-auto max-w-md">
          <p className="text-sm font-medium text-white/60">🏠 ห้องเช่า</p>
          <h1 className="mt-1 text-2xl font-bold leading-snug text-white">
            จับคู่ LINE กับห้องพัก
          </h1>
          <p className="mt-1 text-sm text-white/60">
            สแกน QR จากเจ้าของหอ แล้วทำตามขั้นตอนเพื่อรับใบแจ้งค่าเช่าและข้อความที่เกี่ยวข้องทาง LINE
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-md -mt-2 space-y-3 px-4 pb-10 pt-4">
        <PairForm
          liffId={line?.line_liff_id ?? null}
          addFriendUrl={addFriendUrl}
          appOrigin={appOrigin}
          initialRoomNumber={room ?? ''}
        />
      </div>
    </main>
  )
}
