import { headers } from 'next/headers'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { normalizeOrigin } from '@/lib/pair-url'
import { createServiceClient } from '@/lib/supabase/service'
import { PairForm } from './_components/pair-form'

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomToken() {
  return Array.from({ length: 6 }, () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)]).join('')
}

async function getPairingCode(roomNumber: string): Promise<string | null> {
  const supabase = createServiceClient()

  // หา tenant จาก room number ผ่าน active contract
  const { data: contract } = await supabase
    .from('contracts')
    .select('tenant_id, rooms!inner(room_number)')
    .eq('status', 'active')
    .eq('rooms.room_number', roomNumber)
    .maybeSingle()

  const tenantId = contract?.tenant_id
  if (!tenantId) return null

  // ใช้ token เดิมถ้ายังไม่หมดอายุ
  const { data: existing } = await supabase
    .from('pairing_tokens')
    .select('token')
    .eq('tenant_id', tenantId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing?.token) return existing.token

  // สร้าง token ใหม่
  await supabase.from('pairing_tokens').delete().eq('tenant_id', tenantId).is('used_at', null)
  const token = randomToken()
  const { error } = await supabase.from('pairing_tokens').insert({ tenant_id: tenantId, token })
  if (error) return null
  return token
}

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
  const pairingCode = room ? await getPairingCode(room) : null

  const addFriendUrl = (() => {
    if (!line?.line_oa_basic_id) return null
    const rawId = line.line_oa_basic_id.startsWith('@')
      ? line.line_oa_basic_id.slice(1)
      : line.line_oa_basic_id
    if (pairingCode) {
      // เปิด LINE chat พร้อมรหัสใส่ช่องพิมพ์อัตโนมัติ
      return `https://line.me/R/oaMessage/@${rawId}?text=${encodeURIComponent(pairingCode)}`
    }
    return `https://line.me/R/ti/p/${encodeURIComponent(line.line_oa_basic_id)}`
  })()

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
          pairingCode={pairingCode}
        />
      </div>
    </main>
  )
}
