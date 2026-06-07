export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { TenantPortal } from './_components/tenant-portal'

function parseLiffState(liffState?: string | string[]): URLSearchParams {
  if (!liffState) return new URLSearchParams()
  const raw = Array.isArray(liffState) ? liffState[0] : liffState
  try { return new URLSearchParams(raw.replace(/^\/?\??/, '')) } catch { return new URLSearchParams() }
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const liffStateParams = parseLiffState(params['liff.state'])

  // ถ้า LIFF endpoint ตั้งเป็น /portal แต่มี registerToken ให้ redirect ไปหน้าลงทะเบียนเลย
  const registerToken =
    (params.registerToken as string | undefined) ?? liffStateParams.get('registerToken') ?? undefined
  if (registerToken) {
    redirect(`/portal/register?token=${encodeURIComponent(registerToken)}`)
  }

  const line = await getLineIntegrationPublic()

  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="bg-[#0C1B4D] px-5 pt-14 pb-8">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">พอร์ทัลผู้เช่า</p>
          <h1 className="text-2xl font-bold text-white">ข้อมูลห้องพัก</h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-5">
        <TenantPortal liffId={line?.line_liff_id ?? null} />
      </div>
    </main>
  )
}
