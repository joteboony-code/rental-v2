'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'
import { decryptSecret } from '@/lib/crypto-secrets'

export type TenantPortalData = {
  tenant: {
    id: string
    full_name: string
    phone: string | null
  }
  room: {
    id: string
    room_number: string
    floor: number | null
  } | null
  contract: {
    id: string
    start_date: string
    end_date: string | null
    monthly_rent: number
    deposit_paid: number
  } | null
  bills: Array<{
    id: string
    billing_month: string
    due_date: string
    status: string
    rent_amount: number
    water_amount: number
    electricity_amount: number
    wifi_amount: number
    trash_amount: number
    other_amount: number
    other_note: string | null
    total_amount: number
    paid_amount: number
    remaining_amount: number
    meter: {
      water_prev: number
      water_curr: number
      water_units: number
      electricity_prev: number
      electricity_curr: number
      electricity_units: number
      water_image_url: string | null
      electricity_image_url: string | null
    } | null
    payments: Array<{
      id: string
      amount: number
      payment_method: string
      slip_url: string | null
      paid_at: string
    }>
  }>
  promptpay: { id: string | null; name: string | null }
}

type PortalResult =
  | { success: true; data: TenantPortalData }
  | { success: false; message: string }

export type PortalRoom = {
  room_id: string
  room_number: string
  floor: number | null
  monthly_rent: number
}

export async function getPortalRooms(lineUserId: string): Promise<{ rooms: PortalRoom[] }> {
  const supabase = createServiceClient()
  const { data: tenant } = await supabase
    .from('tenants').select('id').eq('line_user_id', lineUserId.trim()).maybeSingle()
  if (!tenant) return { rooms: [] }

  const { data } = await supabase
    .from('contracts')
    .select('room_id, monthly_rent, rooms(room_number, floor)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .order('start_date', { ascending: true })

  type Row = { room_id: string; monthly_rent: number; rooms: unknown }
  return {
    rooms: (data ?? []).map((r) => {
      const row = r as Row
      const room = row.rooms as { room_number: string; floor: number | null } | null
      return {
        room_id: row.room_id,
        room_number: room?.room_number ?? '—',
        floor: room?.floor ?? null,
        monthly_rent: Number(row.monthly_rent),
      }
    }),
  }
}

export async function getTenantPortalDashboard(lineUserId: string, roomId?: string): Promise<PortalResult> {
  const trimmed = lineUserId.trim()
  if (!trimmed) {
    return { success: false, message: 'ไม่พบ LINE User ID' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_tenant_portal_by_line_user', {
    p_line_user_id: trimmed,
    p_room_id: roomId ?? null,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  if (!data) {
    return { success: false, message: 'ยังไม่ได้เชื่อม LINE กับห้องพัก' }
  }

  // บันทึกเวลาที่เปิด portal ล่าสุด (ใช้ service client เพราะ portal เป็น public/anon)
  try {
    const svc = createServiceClient()
    await svc.from('tenants').update({ last_portal_open_at: new Date().toISOString() }).eq('line_user_id', trimmed)
  } catch { /* ไม่ critical — เปิด portal ต่อได้ */ }

  const svc2 = createServiceClient()
  const { data: settings } = await svc2.from('settings').select('promptpay_id, promptpay_name').eq('id', 1).maybeSingle()

  return {
    success: true,
    data: {
      ...(data as TenantPortalData),
      promptpay: {
        id:   (settings as { promptpay_id?: string | null } | null)?.promptpay_id   ?? null,
        name: (settings as { promptpay_name?: string | null } | null)?.promptpay_name ?? null,
      },
    },
  }
}

// ── Repair requests ──────────────────────────────────────────

export type PortalRepairItem = {
  id: string
  title: string
  description: string | null
  photo_url: string | null
  status: 'pending' | 'in_progress' | 'done' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  admin_note: string | null
  created_at: string
}

export async function getPortalRepairs(
  lineUserId: string
): Promise<{ success: boolean; repairs?: PortalRepairItem[]; message?: string }> {
  const supabase = createServiceClient()

  const { data: tenant } = await supabase
    .from('tenants').select('id, full_name, phone').eq('line_user_id', lineUserId).maybeSingle()
  if (!tenant) return { success: false, message: 'ไม่พบข้อมูลผู้เช่า' }

  const { data, error } = await supabase
    .from('repair_requests')
    .select('id, title, description, photo_url, status, priority, admin_note, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { success: false, message: error.message }
  return { success: true, repairs: (data ?? []) as PortalRepairItem[] }
}

export async function submitPortalRepair(
  lineUserId: string,
  formData: FormData,
  roomId?: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient()

  const { data: tenant } = await supabase
    .from('tenants').select('id, full_name, phone').eq('line_user_id', lineUserId).maybeSingle()
  if (!tenant) return { success: false, message: 'ไม่พบข้อมูลผู้เช่า' }

  let contractQuery = supabase
    .from('contracts').select('room_id')
    .eq('tenant_id', tenant.id).eq('status', 'active')
  if (roomId) contractQuery = contractQuery.eq('room_id', roomId)
  const { data: contract } = await contractQuery.maybeSingle()
  if (!contract) return { success: false, message: 'ไม่พบสัญญาเช่าที่ใช้งานอยู่' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const priority = String(formData.get('priority') ?? 'normal')
  if (!title) return { success: false, message: 'กรุณาระบุหัวข้อ' }

  let photo_url: string | null = null
  const photoFile = formData.get('photo') as File | null
  if (photoFile && photoFile.size > 0) {
    const buffer = await photoFile.arrayBuffer()
    const ext = photoFile.name.split('.').pop() ?? 'jpg'
    const path = `portal/${tenant.id}/${Date.now()}.${ext}`
    const { data: upload } = await supabase.storage
      .from('repair-photos')
      .upload(path, buffer, { contentType: photoFile.type, upsert: false })
    if (upload) {
      photo_url = supabase.storage.from('repair-photos').getPublicUrl(upload.path).data.publicUrl
    }
  }

  const { data: repair, error } = await supabase.from('repair_requests')
    .insert({
      room_id: contract.room_id,
      tenant_id: tenant.id,
      title,
      description,
      priority,
      photo_url,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) return { success: false, message: error.message }

  revalidatePath('/repairs')

  try {
    await notifyOwnerNewRepairFromPortal({
      repairId: repair.id,
      roomId: contract.room_id,
      tenantName: tenant.full_name,
      tenantPhone: tenant.phone,
      title,
      description,
      priority,
      photoUrl: photo_url,
    })
  } catch (error) {
    console.error('notify owner new repair failed', error)
  }

  return { success: true, message: 'แจ้งซ่อมเรียบร้อยแล้ว ทีมงานจะติดต่อกลับครับ' }
}

async function notifyOwnerNewRepairFromPortal({
  repairId,
  roomId,
  tenantName,
  tenantPhone,
  title,
  description,
  priority,
  photoUrl,
}: {
  repairId: string
  roomId: string
  tenantName: string
  tenantPhone: string | null
  title: string
  description: string | null
  priority: string
  photoUrl: string | null
}) {
  const supabase = createServiceClient()

  const { data: cfg } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, owner_line_user_id, app_url')
    .eq('dorm_id', DEFAULT_DORM_ID)
    .maybeSingle()

  if (!cfg?.encrypted_channel_access_token || !cfg.owner_line_user_id) return

  const token = await decryptSecret(cfg.encrypted_channel_access_token)

  const { data: room } = await supabase
    .from('rooms').select('room_number').eq('id', roomId).maybeSingle()
  const roomNumber = (room as { room_number: string } | null)?.room_number ?? '-'

  const priorityLabel: Record<string, string> = {
    low: 'ต่ำ',
    normal: 'ปกติ',
    high: 'สูง',
    urgent: 'ด่วนมาก',
  }
  const appUrl = (cfg.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const repairUrl = appUrl ? `${appUrl}/repairs/${repairId}` : null
  const lines = [
    'มีแจ้งซ่อมใหม่จาก Portal',
    `ห้อง: ${roomNumber}`,
    `ผู้เช่า: ${tenantName}${tenantPhone ? ` (${tenantPhone})` : ''}`,
    `เรื่อง: ${title}`,
    `ความเร่งด่วน: ${priorityLabel[priority] ?? priority}`,
  ]
  if (description) lines.push(`รายละเอียด: ${description}`)
  if (repairUrl) lines.push('', `เปิดดูรายการ: ${repairUrl}`)

  const messages: object[] = [{ type: 'text', text: lines.join('\n') }]
  if (photoUrl) {
    messages.push({ type: 'image', originalContentUrl: photoUrl, previewImageUrl: photoUrl })
  }

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: cfg.owner_line_user_id, messages }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LINE owner repair notification failed ${res.status}: ${body}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function notifyOwnerNewRepair(
  roomId: string,
  title: string,
  priority: string,
  photoUrl: string | null
) {
  const supabase = createServiceClient()

  const { data: cfg } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, owner_line_user_id')
    .eq('dorm_id', DEFAULT_DORM_ID)
    .maybeSingle()

  if (!cfg?.encrypted_channel_access_token || !cfg.owner_line_user_id) return

  const token = await decryptSecret(cfg.encrypted_channel_access_token)

  const { data: room } = await supabase
    .from('rooms').select('room_number').eq('id', roomId).maybeSingle()
  const roomNumber = (room as { room_number: string } | null)?.room_number ?? '—'

  const priorityLabel: Record<string, string> = {
    low: '🟢 ต่ำ', normal: '🟡 ปกติ', high: '🟠 สูง', urgent: '🔴 ด่วนมาก'
  }

  const text = `🔧 มีแจ้งซ่อมใหม่ครับ\n🏠 ห้อง ${roomNumber}\n📝 ${title}\n⚡ ความเร่งด่วน: ${priorityLabel[priority] ?? priority}`

  const messages: object[] = [{ type: 'text', text }]
  if (photoUrl) {
    messages.push({ type: 'image', originalContentUrl: photoUrl, previewImageUrl: photoUrl })
  }

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: cfg.owner_line_user_id, messages }),
  })
}
