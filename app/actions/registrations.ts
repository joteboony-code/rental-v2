'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/require-admin'
import { getLineMessagingConfig } from '@/lib/line-integration'
import { revalidatePath } from 'next/cache'
import { isRateLimited, getClientIp } from '@/lib/rate-limit'
import { notifyOwner } from '@/lib/notify-owner'

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
  skipContract: boolean
  monthlyRent: number
  depositPaid?: number
  approvalType: 'auto_approved' | 'approved'
  reviewedBy?: string | null
}): Promise<{ tenantId: string | null; error: string | null }> {
  const supabase = createServiceClient()

  let tenantId: string | null = opts.matchedTenantId
  let createdNewTenant = false

  if (tenantId) {
    // อัปเดต tenant เดิม (ผู้เช่าปัจจุบันเพิ่ม LINE/เบอร์ หรือผู้เช่าที่ match จากเบอร์)
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
    if (error) return { tenantId: null, error: error.message }
  } else {
    const { data: newTenant, error } = await supabase.from('tenants').insert({
      full_name: opts.fullName,
      phone: opts.phone,
      id_card: opts.idCard,
      line_user_id: opts.lineUserId,
      line_display_name: opts.lineDisplayName,
      line_picture_url: opts.linePictureUrl,
    }).select('id').single()
    if (error || !newTenant) return { tenantId: null, error: error?.message ?? 'create tenant failed' }
    tenantId = newTenant.id
    createdNewTenant = true
  }

  // สร้าง contract ใหม่เฉพาะเมื่อห้องยังไม่มีผู้เช่า
  // ถ้า skipContract = true แปลว่าผู้เช่าเดิมแค่เพิ่ม LINE/เบอร์ → อัปเดต tenant เท่านั้น ไม่แตะ contract/ห้อง
  if (!opts.skipContract) {
    const startDate = opts.moveInDate ?? new Date().toISOString().split('T')[0]
    const { error: contractErr } = await supabase.from('contracts').insert({
      room_id: opts.roomId,
      tenant_id: tenantId,
      start_date: startDate,
      monthly_rent: opts.monthlyRent,
      deposit_paid: opts.depositPaid ?? 0,
      status: 'active',
    })
    if (contractErr) {
      // rollback เฉพาะ tenant ที่เพิ่งสร้างใหม่ — ห้ามลบ tenant เดิมที่ match อยู่แล้ว
      if (createdNewTenant) {
        await supabase.from('tenants').delete().eq('id', tenantId)
      }
      return { tenantId: null, error: contractErr.message }
    }

    // อัปเดตห้องเป็นมีผู้เช่า + ค่ามัดจำให้ตรงกับที่ผู้เช่าระบุ
    const roomUpdate: Record<string, unknown> = { status: 'occupied' }
    if (opts.depositPaid != null) roomUpdate.deposit = opts.depositPaid
    await supabase.from('rooms').update(roomUpdate).eq('id', opts.roomId)
  }

  await supabase.from('tenant_registration_requests').update({
    status: opts.approvalType,
    matched_tenant_id: tenantId,
    reviewed_at: new Date().toISOString(),
    reviewed_by: opts.reviewedBy ?? null,
  }).eq('id', opts.requestId)

  return { tenantId, error: null }
}

// ── Public: submit registration from portal ──────────────────────────────────

export async function submitRegistration(formData: FormData): Promise<SubmitRegistrationResult> {
  const supabase = createServiceClient()

  const registrationToken = String(formData.get('registration_token') ?? '').trim()
  const lineIdToken     = String(formData.get('line_id_token')     ?? '').trim() || null
  const lineDisplayName = String(formData.get('line_display_name') ?? '').trim() || null
  const linePictureUrl  = String(formData.get('line_picture_url')  ?? '').trim() || null

  // Verify LINE ID token server-side
  let lineUserId: string | null = null
  let verifiedName: string | null = lineDisplayName
  let verifiedPicture: string | null = linePictureUrl
  if (lineIdToken) {
    const loginChannelId = process.env.LINE_LOGIN_CHANNEL_ID
    if (loginChannelId) {
      const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: lineIdToken, client_id: loginChannelId }),
      })
      if (verifyRes.ok) {
        const lineProfile = await verifyRes.json() as { sub?: string; name?: string; picture?: string }
        lineUserId = lineProfile.sub ?? null
        verifiedName = lineProfile.name ?? lineDisplayName
        verifiedPicture = lineProfile.picture ?? linePictureUrl
      }
      // If verify fails, treat as no-LINE (goes to pending)
    }
  }
  const fullName        = String(formData.get('full_name')         ?? '').trim()
  const phone           = String(formData.get('phone')             ?? '').trim()
  const idCard          = String(formData.get('id_card')           ?? '').trim() || null
  const moveInDate      = String(formData.get('move_in_date')      ?? '').trim() || null
  const note            = String(formData.get('note')              ?? '').trim() || null
  const depositPaid     = Math.max(0, Math.min(Number(formData.get('deposit_paid') ?? 0) || 0, 1_000_000))

  // ใช้ registration_token เป็นหลักเท่านั้น — ห้ามเชื่อ room_id/room_number จาก client
  if (!registrationToken) return { success: false, message: 'ลิงก์ไม่ถูกต้อง กรุณาสแกน QR ใหม่' }

  // Rate limit: 3 submissions per IP per 10 minutes
  const ip = await getClientIp()
  if (await isRateLimited(`registration:${ip}`, 3, 600))
    return { success: false, message: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' }

  if (!fullName)          return { success: false, message: 'กรุณากรอกชื่อ-นามสกุล' }
  if (fullName.length < 2 || fullName.length > 200) return { success: false, message: 'ชื่อต้องยาว 2-200 ตัวอักษร' }
  if (!phone)             return { success: false, message: 'กรุณากรอกเบอร์โทรศัพท์' }
  const cleanPhone = phone.replace(/[-\s]/g, '')
  if (!/^0[0-9]{8,9}$/.test(cleanPhone)) return { success: false, message: 'เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวอย่าง: 0812345678)' }
  if (idCard && !/^\d{13}$/.test(idCard)) return { success: false, message: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' }
  if (moveInDate) {
    const d = new Date(moveInDate)
    const maxDate = new Date(); maxDate.setFullYear(maxDate.getFullYear() + 1)
    if (isNaN(d.getTime()) || d < new Date('2000-01-01') || d > maxDate) {
      return { success: false, message: 'วันที่เข้าพักไม่ถูกต้อง (ต้องอยู่ระหว่างปี 2000 ถึง 1 ปีข้างหน้า)' }
    }
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id, room_number, monthly_rent, status')
    .eq('registration_token', registrationToken)
    .maybeSingle()

  if (!room) return { success: false, message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาสแกน QR ใหม่' }
  if (room.status === 'maintenance') return { success: false, message: 'ห้องนี้ปิดปรับปรุง กรุณาติดต่อเจ้าของหอ' }

  const roomId = room.id
  const roomNumber = room.room_number

  const pendingReasons: string[] = []
  let matchedTenantId: string | null = null

  // ไม่มี line_user_id → เข้า pending เสมอ ห้าม auto approve
  if (!lineUserId) pendingReasons.push('ไม่ได้เปิดผ่านแอป LINE จึงยังไม่มีข้อมูล LINE')

  // Case B: ห้องมีผู้เช่าอยู่แล้ว → pending และ match กับผู้เช่าปัจจุบัน
  // (สำหรับผู้เช่าเดิมสแกน QR เพื่อเพิ่ม LINE/เบอร์ — approve จะอัปเดต tenant เดิม)
  const { data: activeContract } = await supabase
    .from('contracts')
    .select('id, tenant_id')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .maybeSingle()
  if (activeContract) {
    pendingReasons.push('ห้องมีผู้เช่าอยู่แล้ว')
    matchedTenantId = activeContract.tenant_id
  }

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

  // Case D: เบอร์ซ้ำกับ tenant อื่นที่ไม่ใช่ผู้เช่าปัจจุบันของห้องนี้
  // → เข้า pending ให้ admin ตรวจ ห้าม auto update tenant ผิดคน
  const { data: tenantByPhone } = await supabase
    .from('tenants')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()
  if (tenantByPhone && tenantByPhone.id !== activeContract?.tenant_id) {
    pendingReasons.push('เบอร์โทรซ้ำกับผู้เช่าในระบบ')
    // เก็บไว้เป็นข้อมูลให้ admin ตรวจ — ไม่ทับ tenant ผู้เช่าปัจจุบันของห้อง
    if (!matchedTenantId) matchedTenantId = tenantByPhone.id
  }

  const status = pendingReasons.length > 0 ? ('pending' as const) : ('auto_approved' as const)

  const { data: req, error: insertErr } = await supabase
    .from('tenant_registration_requests')
    .insert({
      room_id: roomId, room_number: roomNumber,
      line_user_id: lineUserId, line_display_name: verifiedName, line_picture_url: verifiedPicture,
      full_name: fullName, phone, id_card: idCard, move_in_date: moveInDate, note,
      deposit_paid: depositPaid,
      status, pending_reason: pendingReasons.join(', ') || null,
      matched_tenant_id: matchedTenantId,
    })
    .select('id')
    .single()

  if (insertErr || !req) return { success: false, message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }

  if (status === 'auto_approved') {
    // auto path = ห้องว่าง + มี LINE + ไม่ซ้ำ → สร้าง tenant + contract ใหม่เสมอ
    const { tenantId, error } = await doApprove({
      requestId: req.id, roomId, fullName, phone, idCard, moveInDate,
      lineUserId, lineDisplayName: verifiedName, linePictureUrl: verifiedPicture,
      matchedTenantId: null, skipContract: false,
      monthlyRent: Number(room.monthly_rent),
      depositPaid,
      approvalType: 'auto_approved',
    })
    if (error) {
      await supabase.from('tenant_registration_requests')
        .update({ status: 'pending', pending_reason: 'เกิดข้อผิดพลาดระหว่างสร้างข้อมูล กรุณาติดต่อเจ้าของหอ' })
        .eq('id', req.id)
      return { success: false, message: 'เกิดข้อผิดพลาด กรุณาติดต่อเจ้าของหอ' }
    }
    await logAudit('registration_auto_approved', roomId, tenantId, req.id)
  }

  {
    const config = await getLineMessagingConfig()
    const appUrl = config?.appUrl ?? ''
    const linkLine = appUrl ? `\n🔗 ${appUrl}/tenant-registrations` : ''
    const ownerMsg = status === 'auto_approved'
      ? `✅ มีผู้เช่าลงทะเบียนใหม่สำเร็จ\nห้อง: ${roomNumber}\nชื่อ: ${fullName}\nเบอร์: ${phone}`
      : `📋 มีคำขอลงทะเบียนรอตรวจ\nห้อง: ${roomNumber}\nชื่อ: ${fullName}\nเบอร์: ${phone}\nเหตุผล: ${pendingReasons.join(', ')}${linkLine}`
    notifyOwner(ownerMsg, 'registration').catch((e) => { console.error('[notify registration]', e) })
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
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }

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

  // ถ้าห้องมี active contract อยู่ = ผู้เช่าเดิมสแกน QR เพื่อเพิ่ม LINE/เบอร์
  // → อัปเดต tenant เดิมของ contract นั้น ไม่สร้าง contract ใหม่ (ไม่ block)
  const { data: activeContract } = await serviceSupabase
    .from('contracts')
    .select('id, tenant_id')
    .eq('room_id', req.room_id)
    .eq('status', 'active')
    .maybeSingle()

  let skipContract = false
  let matchedTenantId: string | null = req.matched_tenant_id
  if (activeContract) {
    skipContract = true
    matchedTenantId = activeContract.tenant_id
  }

  const { tenantId, error: err } = await doApprove({
    requestId: req.id, roomId: req.room_id,
    fullName: req.full_name, phone: req.phone,
    idCard: req.id_card, moveInDate: req.move_in_date,
    lineUserId: req.line_user_id, lineDisplayName: req.line_display_name, linePictureUrl: req.line_picture_url,
    matchedTenantId,
    skipContract,
    monthlyRent: Number(room.monthly_rent),
    depositPaid: Number(req.deposit_paid ?? 0),
    approvalType: 'approved',
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

  await logAudit('registration_approved', req.room_id, tenantId, requestId)
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
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }

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
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()
  const newToken = crypto.randomUUID()
  const { error } = await supabase.from('rooms').update({ registration_token: newToken }).eq('id', roomId)
  if (error) return { success: false, message: error.message }
  await logAudit('room_pairing_token_regenerated', roomId, null, roomId)
  revalidatePath(`/rooms/${roomId}`)
  return { success: true, token: newToken }
}
