'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

const MAX_REPAIR_PHOTO_SIZE = 5 * 1024 * 1024
const ALLOWED_REPAIR_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
import { signPortalToken, verifyPortalToken } from '@/lib/portal-session'
import { buildBillDetailPath } from '@/lib/portal-url'
import { isRateLimited } from '@/lib/rate-limit'
import { notifyOwner } from '@/lib/notify-owner'
import { createSignedStorageUrl } from '@/lib/storage-urls'

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
    detail_url?: string
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

async function getAuthorizedPortalContract(lineUserId: string, roomId?: string) {
  const supabase = createServiceClient()

  let dedicatedQuery = supabase
    .from('contracts')
    .select('id, tenant_id, room_id, tenants(id, full_name, phone)')
    .eq('status', 'active')
    .eq('line_recipient_user_id', lineUserId)
  if (roomId) dedicatedQuery = dedicatedQuery.eq('room_id', roomId)
  const { data: dedicated } = await dedicatedQuery.order('start_date', { ascending: false }).limit(1).maybeSingle()
  if (dedicated) return dedicated

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, full_name, phone')
    .eq('line_user_id', lineUserId)
    .maybeSingle()
  if (!tenant) return null

  let fallbackQuery = supabase
    .from('contracts')
    .select('id, tenant_id, room_id, tenants(id, full_name, phone)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .is('line_recipient_user_id', null)
  if (roomId) fallbackQuery = fallbackQuery.eq('room_id', roomId)
  const { data: fallback } = await fallbackQuery.order('start_date', { ascending: false }).limit(1).maybeSingle()
  return fallback
}

export async function verifyAndGetPortalToken(
  idToken: string
): Promise<{ success: true; token: string } | { success: false; message: string }> {
  const loginChannelId = process.env.LINE_LOGIN_CHANNEL_ID
  if (!loginChannelId) return { success: false, message: 'ระบบยังไม่ได้ตั้งค่า LINE Login Channel' }
  if (!idToken) return { success: false, message: 'ไม่พบ LINE ID token' }

  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: loginChannelId }),
  })
  if (!verifyRes.ok) return { success: false, message: 'ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาเปิดใหม่อีกครั้ง' }

  const profile = await verifyRes.json() as { sub?: string }
  if (!profile.sub) return { success: false, message: 'ไม่สามารถดึง LINE User ID ได้' }

  return { success: true, token: signPortalToken(profile.sub) }
}

export async function getPortalRooms(portalToken: string): Promise<{ rooms: PortalRoom[] }> {
  const lineUserId = verifyPortalToken(portalToken)
  if (!lineUserId) return { rooms: [] }
  const supabase = createServiceClient()

  const { data: dedicated } = await supabase
    .from('contracts')
    .select('room_id, monthly_rent, rooms(room_number, floor)')
    .eq('status', 'active')
    .eq('line_recipient_user_id', lineUserId)
    .order('start_date', { ascending: true })

  const { data: tenant } = await supabase
    .from('tenants').select('id').eq('line_user_id', lineUserId).maybeSingle()
  const { data: fallback } = tenant
    ? await supabase
        .from('contracts')
        .select('room_id, monthly_rent, rooms(room_number, floor)')
        .eq('tenant_id', tenant.id)
        .eq('status', 'active')
        .is('line_recipient_user_id', null)
        .order('start_date', { ascending: true })
    : { data: [] }

  type Row = { room_id: string; monthly_rent: number; rooms: unknown }
  const uniqueRows = new Map<string, Row>()
  for (const item of [...(dedicated ?? []), ...(fallback ?? [])]) {
    const row = item as Row
    uniqueRows.set(row.room_id, row)
  }
  return {
    rooms: [...uniqueRows.values()].map((row) => {
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

export async function getTenantPortalDashboard(portalToken: string, roomId?: string): Promise<PortalResult> {
  const lineUserId = verifyPortalToken(portalToken)
  if (!lineUserId) return { success: false, message: 'Session หมดอายุ กรุณาเปิดหน้า Portal ใหม่อีกครั้ง' }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('get_tenant_portal_by_line_user', {
    p_line_user_id: lineUserId,
    p_room_id: roomId ?? null,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  if (!data) {
    return { success: false, message: 'ยังไม่ได้เชื่อม LINE กับห้องพัก' }
  }

  const portalData = data as TenantPortalData
  // Record only the authenticated recipient and the room returned by the
  // authorization RPC. Previewing as admin does not count as a tenant opening.
  try {
    const { error: trackingError } = await supabase.rpc('record_portal_bill_open', {
      p_line_user_id: lineUserId,
      p_tenant_id: portalData.tenant.id,
      p_room_id: portalData.room?.id ?? null,
    })
    if (trackingError) console.error('[portal] record open failed', { message: trackingError.message })
  } catch { /* ไม่ critical — เปิด portal ต่อได้ */ }

  const svc2 = createServiceClient()
  const { data: settings } = await svc2.from('settings').select('promptpay_id, promptpay_name').eq('id', 1).maybeSingle()

  // Generate short-lived signed URLs for payment slips (bucket เป็น private)
  const svc3 = createServiceClient()
  for (const bill of portalData.bills ?? []) {
    bill.detail_url = buildBillDetailPath(bill.id)
    if (bill.meter) {
      const [waterImageUrl, electricityImageUrl] = await Promise.all([
        createSignedStorageUrl(svc3, 'meter-photos', bill.meter.water_image_url, 3600),
        createSignedStorageUrl(svc3, 'meter-photos', bill.meter.electricity_image_url, 3600),
      ])
      bill.meter.water_image_url = waterImageUrl
      bill.meter.electricity_image_url = electricityImageUrl
    }
    for (const payment of bill.payments ?? []) {
      if (payment.slip_url) {
        const path = payment.slip_url.split('/payment-slips/')[1]
        if (path) {
          const { data: signed } = await svc3.storage.from('payment-slips').createSignedUrl(path, 3600)
          payment.slip_url = signed?.signedUrl ?? null
        }
      }
    }
  }

  return {
    success: true,
    data: {
      ...portalData,
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
  portalToken: string,
  roomId?: string
): Promise<{ success: boolean; repairs?: PortalRepairItem[]; message?: string }> {
  const lineUserId = verifyPortalToken(portalToken)
  if (!lineUserId) return { success: false, message: 'Session หมดอายุ กรุณาเปิดใหม่อีกครั้ง' }
  const supabase = createServiceClient()

  const contract = await getAuthorizedPortalContract(lineUserId, roomId)
  if (!contract) return { success: false, message: 'ไม่พบข้อมูลห้องที่ได้รับอนุญาต' }

  const { data, error } = await supabase
    .from('repair_requests')
    .select('id, title, description, photo_url, status, priority, admin_note, created_at')
    .eq('tenant_id', contract.tenant_id)
    .eq('room_id', contract.room_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { success: false, message: error.message }
  const repairs = await Promise.all(((data ?? []) as PortalRepairItem[]).map(async (repair) => ({
    ...repair,
    photo_url: await createSignedStorageUrl(supabase, 'repair-photos', repair.photo_url, 3600),
  })))
  return { success: true, repairs }
}

export async function submitPortalRepair(
  portalToken: string,
  formData: FormData,
  roomId?: string
): Promise<{ success: boolean; message: string }> {
  const lineUserId = verifyPortalToken(portalToken)
  if (!lineUserId) return { success: false, message: 'Session หมดอายุ กรุณาเปิดใหม่อีกครั้ง' }
  if (await isRateLimited(`portal-repair:${lineUserId}`, 5, 3600)) {
    return { success: false, message: 'ส่งแจ้งซ่อมบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }
  }
  const supabase = createServiceClient()

  const contract = await getAuthorizedPortalContract(lineUserId, roomId)
  if (!contract) return { success: false, message: 'ไม่พบสัญญาเช่าที่ใช้งานอยู่' }
  const tenant = contract.tenants as unknown as { id: string; full_name: string; phone: string | null } | null
  if (!tenant) return { success: false, message: 'ไม่พบข้อมูลผู้เช่า' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
  const rawPriority = String(formData.get('priority') ?? 'normal')
  const priority = (VALID_PRIORITIES as readonly string[]).includes(rawPriority) ? rawPriority : 'normal'
  if (!title) return { success: false, message: 'กรุณาระบุหัวข้อ' }

  let photo_url: string | null = null
  const photoFile = formData.get('photo') as File | null
  if (photoFile && photoFile.size > 0) {
    if (photoFile.size > MAX_REPAIR_PHOTO_SIZE) {
      return { success: false, message: 'ไฟล์รูปภาพต้องไม่เกิน 5 MB' }
    }
    const ext = ALLOWED_REPAIR_PHOTO_TYPES[photoFile.type]
    if (!ext) {
      return { success: false, message: 'รองรับเฉพาะไฟล์ JPEG, PNG, WebP' }
    }
    const buffer = await photoFile.arrayBuffer()
    const path = `portal/${tenant.id}/${Date.now()}.${ext}`
    const { data: upload } = await supabase.storage
      .from('repair-photos')
      .upload(path, buffer, { contentType: photoFile.type, upsert: false })
    if (upload) {
      photo_url = upload.path
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

  const { data: room } = await supabase
    .from('rooms').select('room_number').eq('id', roomId).maybeSingle()
  const roomNumber = (room as { room_number: string } | null)?.room_number ?? '-'

  const priorityLabel: Record<string, string> = {
    low: 'ต่ำ',
    normal: 'ปกติ',
    high: 'สูง',
    urgent: 'ด่วนมาก',
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const repairUrl = appUrl ? `${appUrl}/repairs/${repairId}` : null
  const lines = [
    'มีแจ้งซ่อมใหม่จาก Portal',
    `ห้อง: ${roomNumber}`,
    `ผู้เช่า: ${tenantName}${tenantPhone ? ` (${tenantPhone})` : ''}`,
    `เรื่อง: ${title}`,
    `ความเร่งด่วน: ${priorityLabel[priority] ?? priority}`,
  ]
  if (description) lines.push(`รายละเอียด: ${description}`)

  await notifyOwner(
    lines.join('\n'),
    'repair',
    repairUrl ? { label: 'ดูรายการซ่อม', url: repairUrl } : undefined
  )
}
