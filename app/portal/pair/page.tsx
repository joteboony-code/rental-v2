import { redirect } from 'next/navigation'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { createServiceClient } from '@/lib/supabase/service'
import { PairForm } from './_components/pair-form'

async function getAlreadyLinked(roomNumber: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: contract } = await supabase
    .from('contracts')
    .select('line_recipient_user_id, rooms!inner(room_number)')
    .eq('status', 'active')
    .eq('rooms.room_number', roomNumber)
    .maybeSingle()

  return !!contract?.line_recipient_user_id
}

function parseLiffState(liffState?: string | string[]): URLSearchParams {
  if (!liffState) return new URLSearchParams()
  const raw = Array.isArray(liffState) ? liffState[0] : liffState
  try {
    return new URLSearchParams(raw.replace(/^\/?\??/, ''))
  } catch {
    return new URLSearchParams()
  }
}

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const liffStateParams = parseLiffState(params['liff.state'])

  // ถ้ามี registerToken ใน liff.state หรือ query param ให้ redirect ไปหน้า register
  const registerToken =
    (params.registerToken as string | undefined) ?? liffStateParams.get('registerToken') ?? undefined
  if (registerToken) {
    redirect(`/portal/register?token=${encodeURIComponent(registerToken)}`)
  }

  const room = (params.room as string | undefined) ?? liffStateParams.get('room') ?? undefined
  const line = await getLineIntegrationPublic()
  const alreadyLinked = room ? await getAlreadyLinked(room) : false

  return (
    <main className="min-h-dvh bg-slate-100">
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

      <div className="mx-auto max-w-md -mt-2 space-y-3 px-4 pb-10 pt-4">
        <PairForm
          liffId={line?.line_liff_id_pairing ?? null}
          initialRoomNumber={room ?? ''}
          alreadyLinked={alreadyLinked}
        />
      </div>
    </main>
  )
}
