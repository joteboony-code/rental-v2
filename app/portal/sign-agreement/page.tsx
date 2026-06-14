export const dynamic = 'force-dynamic'

import { getLineIntegrationPublic } from '@/lib/line-integration'
import { SignAgreementClient } from './_components/sign-agreement-client'

export default async function SignAgreementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const contractId = typeof params.contractId === 'string' ? params.contractId : ''

  const line = await getLineIntegrationPublic()

  return (
    <main className="min-h-dvh bg-slate-50">
      <div className="bg-[#0C1B4D] px-5 pt-14 pb-8">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">พอร์ทัลผู้เช่า</p>
          <h1 className="text-2xl font-bold text-white">ลงนามสัญญาเช่า</h1>
        </div>
      </div>
      <div className="mx-auto max-w-lg px-4 py-5">
        <SignAgreementClient
          contractId={contractId}
          liffId={line?.line_liff_id ?? null}
        />
      </div>
    </main>
  )
}
