'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { revalidatePath } from 'next/cache'

export type SubmitRegistrationResult = {
  success: boolean
  status?: 'auto_approved' | 'pending'
  message: string
}

export type RegistrationRequest = {
  id: string
  room_id: string
  room_number: string
  line_user_id: string | null
  line_display_name: string | null
  line_picture_url: string | null
  full_name: string
  phone: string
  id_card: string | null
  move_in_date: string | null
  note: string | null
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved'
  pending_reason: string | null
  matched_tenant_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  admin_note: string | null
  created_at: string
}

async function pushLine(to: string, text: string, token: string) {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    })
    if (!res.ok) console.error('[registrations] LINE push failed:', res.status)
  } catch (err) {
    console.error('[registrations] LINE push error:', err)
  }
}

async function logAudit(
  action: string,
  roomId: string | null,
  tenantId: string | null,
  requestId: string,
  extra?: Record<string, unknown>
) {
  const supabase = createServiceClient()
  await supabase.from('audit_logs').insert({
    action,
    entity_type: 'registration',
    entity_id: requestId,
    room_id: roomId,
    tenant_id: tenantId,
    new_value: { request_id: requestId, ...extra },
  }).then(({ error }) => { if (error) console.error('[registrations] audit log error:', error) })
}

// ── Internal: create tenant + contract ───────────────────────────────────────

async function doApprove(opts: {
  requestId: string
  roomId: string
  fullName: string
  phone: string
  idCard: string | null
  moveInDate: string | null
  lineUserId: string | null
  lineDisplayName: string | null
  linePictureUrl: string | null
  matchedTenantId: string | null
  monthlyRent: number
  reviewedBy?: string | null
}): Promise<string | null> {
  const supabase = createServiceClient()

  let tenantId: string | null = opts.matchedTenantId

  if (tenantId) {
    const { error } = await supabase.from('tenants').update({
      full_name: opts.fullName,
      phone: opts.phone,
      ...(opts.idCard ? { id_card: opts.idCard } : {}),
      ...(opts.lineUserId ? {
        line_user_id: opts.lineUserId,
        line_display_name: opts.lineDisplayName,
        line_picture_url: opts.linePictureUrl,
      } : {}),
    }).eq('id', tenantId)
    if (error) return error.message
  } else {
    const { data: newTenant, error } = await supabase.from('tenants').insert({
      full_name: opts.fullName,
      phone: opts.phone,
      id_card: opts.idCard,
      line_user_id: opts.lineUserId,
      line_display_name: opts.lineDisplayName,
      line_picture_url: opts.linePictureUrl,
    }).select('id').single()
    if (error || !newTenant) return error?.message ?? 'create tenant failed'
    tenantId = newTenant.id
  }

  const startDate = opts.moveInDate ?? new Date().toISOString().split('T')[0]
  const { error: contractErr } = await supabase.from('contracts').insert({
    room_id: opts.roomId,
    tenant_id: tenantId,
    start_date: startDate,
    monthly_rent: opts.monthlyRent,
    status: 'active',
  })
  if (contractErr) return contractErr.message

  await supabase.from('tenant_registration_requests').update({
    status: 'auto_approved',
    matched_tenant_id: tenantId,
    reviewed_at: new Date().toISOString(),
    reviewed_by: opts.reviewedBy ?? null,
  }).eq('id', opts.requestId)

  await logAudit('registration_auto_approved', opts.roomId, tenantId, opts.requestId)
  return null
}

// ── Public: submit registration from portal ──────────────────────────────────

export async function submitRegistration(formData: FormData): Promise<SubmitRegistrationResult> {
  const supabase = createServiceClient()

  const roomId          = String(formData.get('room_id')          ?? '').trim()
  const roomNumber      = String(formData.get('room_number')       ?? '').trim()
  const lineUserId      = String(formData.get('line_user_id')      ?? '').trim() || null
  const lineDisplayName = String(formData.get('line_display_name') ?? '').trim() || null
  const linePictureUrl  = String(formData.get('line_picture_url')  ?? '').trim() || null
  const fullName        = String(formData.get('full_name')         ?? '').trim()
  const phone           = String(formData.get('phone')             ?? '').trim()
  const idCard          = String(formData.get('id_card')           ?? '').trim() || null
  const moveInDate      = String(formData.get('move_in_date')      ?? '').trim() || null
  const note            = String(formData.get('note')              ?? '').trim() || null

  if (!roomId || !roomNumber) return { success: false, message: 'ลิงก์ไม่ถูกต้อง กรุณาสแกน QR ใหม่' }
  if (!fullName)              return { success: false, message: 'กรุณากรอกชื่อ-นามสกุล' }
  if (!phone)                 return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์' }

  const { data: room } = await supabase
    .from('rooms')
    .select('id, room_number, monthly_rent, status')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) return { success: false, message: 'ไม่พบห้องที่ระบุ' }
  if (room.status === 'maintenance') return { success: false, message: 'ห้องนี้ปิดปรับปรุง กรุณาติดต่อเจ้าของหอ' }

  const pendingReasons: string[] = []

  // Case B: room has active contract
  const { data: activeContract } = await supabase
    .from('contracts')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .maybeSingle()
  if (activeContract) pendingReasons.push('ห้องมีผู้เช่าอยู่แล้ว')

  // Case C: LINE already paired to another room
  if (lineUserId) {
    const { data: tenantByLine } = await supabase
      .from('tenants')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle()
    if (tenantByLine) {
      const { data: lineContract } = await supabase
        .from('contracts')
        .select('room_id')
        .eq('tenant_id', tenantByLine.id)
        .eq('status', 'active')
        .maybeSingle()
      if (lineContract && lineContract.room_id !== roomId) {
        pendingReasons.push('LINE นี้ผูกกับห้องอื่นอยู่แล้ว')
      }
    }
  }

  // Case D: phone duplicate
  let matchedTenantId: string | null = null
  const { data: tenantByPhone } = await supabase
    .from('tenants')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()
  if (tenantByPhone) {
    matchedTenantId = tenantByPhone.id
    const { data: phoneContract } = await supabase
      .from('contracts')
      .select('id')
      .eq('tenant_id', tenantByPhone.id)
      .eq('status', 'active')
      .maybeSingle()
    if (phoneContract) pendingReasons.push('เบอร์โทรซ้ำกับผู้เช่าที่มีสัญญาอยู่')
  }

  const status = pendingReasons.length > 0 ? ('pending' as const) : ('auto_approved' as const)

  const { data: req, error: insertErr } = await supabase
    .from('tenant_registration_requests')
    .insert({
      room_id: roomId, room_number: roomNumber,
      line_user_id: lineUserId, line_display_name: lineDisplayName, line_picture_url: linePictureUrl,
      full_name: fullName, phone, id_card: idCard, move_in_date: moveInDate, note,
      status, pending_reason: pendingReasons.join(', ') || null,
      matched_tenant_id: matchedTenantId,
    })
    .select('id')
    .single()

  if (insertErr || !req) return { success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }

  if (status === 'auto_approved') {
    const err = await doApprove({
      requestId: req.id, roomId, fullName, phone, idCard, moveInDate,
      lineUserId, lineDisplayName, linePictureUrl, matchedTenantId,
      monthlyRent: Number(room.monthly_rent),
    })
    if (err) {
      await supabase.from('tenant_registration_requests')
        .update({ status: 'pending', pending_reason: 'เกิดข้อผิดพลาดระหว่างสร้างข้อมูล กรุณาติดต่อเจ้าของหอ' })
        .eq('id', req.id)
      return { success: false, message: 'เกิดข้อผิดพลาด กรุณาติดต่อเจ้าของหอ' }
    }
  }

  const config = await getLineMessagingConfig()
  if (config?.ownerLineUserId && config?.channelAccessToken) {
    const appUrl = config.appUrl ?? ''
    const linkLine = appUrl ? `\n🔗 ${appUrl}/tenant-registrations` : ''
    const ownerMsg = status === 'auto_approved'
      ? `✅ มีผู้เช่าลงทะเบียนใหม่สำเร็จ\nห้อง: ${roomNumber}\nชื่อ: ${fullName}\nเบอร์: ${phone}`
      : `📋 มีคำขอลงทะเบียนรอตรวจ\nห้อง: ${roomNumber}\nชื่อ: ${fullName}\nเบอร์: ${phone}\nเหตุผล: ${pendingReasons.join(', ')}${linkLine}`
    await pushLine(config.ownerLineUserId, ownerMsg, config.channelAccessToken)
  }

  return {
    success: true,
    status,
    message: status === 'auto_approved'
      ? 'ลงทะเบียนสำเร็จ ระบบผูกห้องกับ LINE ของคุณแล้ว'
      : 'ส่งคำขอเรียบร้อยแล้ว กรุณารอเจ้าของหอตรวจสอบ',
  }
}

// ── Admin: approve ───────────────────────────────────────────────────────────

export async function approveRegistration(
  requestId: string,
  adminNote?: string,
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const serviceSupabase = createServiceClient()

  const { data: req } = await serviceSupabase
    .from('tenant_registration_requests')
    .select('*')
    .eq('id', requestId)
    .single()
  if (!req) return { success: false, message: 'ไม่พบคำขอ' }
  if (req.status !== 'pending') return { success: false, message: 'คำขอนี้ดำเนินการแล้ว' }

  const { data: room } = await serviceSupabase
    .from('rooms')
    .select('monthly_rent')
    .eq('id', req.room_id)
    .maybeSingle()
  if (!room) return { success: false, message: 'ไม่พบห้อง' }

  const { data: existing } = await serviceSupabase
    .from('contracts')
    .select('id')
    .eq('room_id', req.room_id)
    .eq('status', 'active')
    .maybeSingle()
  if (existing) return { success: false, message: 'ห้องนี้มีผู้เช่าใหม่เข้ามาแล้ว กรุณาตรวจสอบ' }

  const { data: { user } } = await supabase.auth.getUser()

  const err = await doApprove({
    requestId: req.id, roomId: req.room_id,
    fullName: req.full_name, phone: req.phone,
    idCard: req.id_card, moveInDate: req.move_in_date,
    lineUserId: req.line_user_id, lineDisplayName: req.line_display_name, linePictureUrl: req.line_picture_url,
    matchedTenantId: req.matched_tenant_id,
    monthlyRent: Number(room.monthly_rent),
    reviewedBy: user?.id ?? null,
  })
  if (err) return { success: false, message: err }

  if (adminNote) {
    await serviceSupabase.from('tenant_registration_requests')
      .update({ admin_note: adminNote })
      .eq('id', requestId)
  }

  const config = await getLineMessagingConfig()
  if (req.line_user_id && config?.channelAccessToken) {
    await pushLine(req.line_user_id, `✅ คำขอลงทะเบียนของคุณได้รับการอนุมัติแล้ว\nห้อง: ${req.room_number}\nชื่อ: ${req.full_name}\nยินดีต้อนรับ 🏠`, config.channelAccessToken)
  }

  await logAudit('registration_approved', req.room_id, req.matched_tenant_id, requestId)
  revalidatePath('/tenant-registrations')
  revalidatePath('/rooms')
  revalidatePath('/tenants')
  return { success: true, message: 'อนุมัติสำเร็จ' }
}

// ── Admin: reject ────────────────────────────────────────────────────────────

export async function rejectRegistration(
  requestId: string,
  adminNote?: string,
): Promise<{ success: boolean; message: string }> {
  const serviceSupabase = createServiceClient()

  const { data: req } = await serviceSupabase
    .from('tenant_registration_requests')
    .select('*')
    .eq('id', requestId)
    .single()
  if (!req) return { success: false, message: 'ไม่พบคำขอ' }
  if (req.status !== 'pending') return { success: false, message: 'คำขอนี้ดำเนินการแล้ว' }

  await serviceSupabase.from('tenant_registration_requests').update({
    status: 'rejected',
    admin_note: adminNote ?? null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', requestId)

  const config = await getLineMessagingConfig()
  if (req.line_user_id && config?.channelAccessToken) {
    await pushLine(req.line_user_id, `❌ คำขอลงทะเบียนของคุณถูกปฏิเสธ\nห้อง: ${req.room_number}\nกรุณาติดต่อเจ้าของหอเพื่อข้อมูลเพิ่มเติม`, config.channelAccessToken)
  }

  await logAudit('registration_rejected', req.room_id, req.matched_tenant_id, requestId)
  revalidatePath('/tenant-registrations')
  return { success: true, message: 'ปฏิเสธแล้ว' }
}

// ── Admin: regenerate room token ─────────────────────────────────────────────

export async function regenerateRegistrationToken(
  roomId: string,
): Promise<{ success: boolean; token?: string; message?: string }> {
  const supabase = await createClient()
  const newToken = crypto.randomUUID()
  const { error } = await supabase.from('rooms').update({ registration_token: newToken }).eq('id', roomId)
  if (error) return { success: false, message: error.message }
  await logAudit('room_pairing_token_regenerated', roomId, null, roomId)
  revalidatePath(`/rooms/${roomId}`)
  return { success: true, token: newToken }
}
