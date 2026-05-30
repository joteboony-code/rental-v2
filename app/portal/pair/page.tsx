import { getLineIntegrationPublic } from '@/lib/line-integration'
import { createServiceClient } from '@/lib/supabase/service'
import { PairForm } from './_components/pair-form'

async function getAlreadyLinked(roomNumber: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: contract } = await supabase
    .from('contracts')
    .select('tenant_id, rooms!inner(room_number)')
    .eq('status', 'active')
    .eq('rooms.room_number', roomNumber)
    .maybeSingle()

  if (!contract?.tenant_id) return false

  const { data: tenant } = await supabase
    .from('tenants')
    .select('line_user_id')
    .eq('id', contract.tenant_id)
    .maybeSingle()

  return !!tenant?.line_user_id
}

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>
}) {
  const { room } = await searchParams
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
          liffId={line?.line_liff_id_pairing ?? line?.line_liff_id ?? null}
          initialRoomNumber={room ?? ''}
          alreadyLinked={alreadyLinked}
        />
      </div>
    </main>
  )
}
