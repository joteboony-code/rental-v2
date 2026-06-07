import { createServiceClient } from '@/lib/supabase/service'
import { getLineIntegrationPublic } from '@/lib/line-integration'
import { RegisterForm } from './_components/register-form'

type Room = {
  id: string
  room_number: string
  status: string
  monthly_rent: number
}

async function getRoomByToken(token: string): Promise<Room | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('rooms')
    .select('id, room_number, status, monthly_rent')
    .eq('registration_token', token)
    .maybeSingle()
  return data as Room | null
}

async function getRoomByNumber(roomNumber: string): Promise<Room | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('rooms')
    .select('id, room_number, status, monthly_rent')
    .eq('room_number', roomNumber)
    .maybeSingle()
  return data as Room | null
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = params.token as string | undefined
  const roomParam = params.room as string | undefined

  let room: Room | null = null
  if (token) {
    room = await getRoomByToken(token)
  } else if (roomParam) {
    room = await getRoomByNumber(roomParam)
  }

  const line = await getLineIntegrationPublic()

  if (!room) {
    return (
      <main className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm">
          <p className="text-2xl mb-2">❌</p>
          <h1 className="font-bold text-slate-800 text-lg mb-1">ลิงก์ไม่ถูกต้อง</h1>
          <p className="text-sm text-slate-500">กรุณาสแกน QR code จากเจ้าของหอใหม่อีกครั้ง</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-100">
      <div className="bg-[#1a3a6b] px-4 pb-8 pt-10">
        <div className="mx-auto max-w-md">
          <p className="text-sm font-medium text-white/60">🏠 ห้องเช่า</p>
          <h1 className="mt-1 text-2xl font-bold leading-snug text-white">ลงทะเบียนผู้เช่า</h1>
          <p className="mt-1 text-sm text-white/60">
            กรอกข้อมูลเพื่อลงทะเบียนเข้าห้องพักและรับการแจ้งเตือนผ่าน LINE
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-md -mt-2 space-y-3 px-4 pb-10 pt-4">
        <RegisterForm
          room={room}
          liffId={line?.line_liff_id_pairing ?? null}
          registrationToken={token ?? null}
        />
      </div>
    </main>
  )
}
