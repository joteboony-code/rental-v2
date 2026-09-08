'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from './audit'
import { getAuthedUser } from '@/lib/require-admin'
import { bangkokDateKey } from '@/lib/date-utils'
import { dueDateForBillingMonth, prorateRent } from '@/lib/billing'
import { createServiceClient } from '@/lib/supabase/service'

function isValidDraftPhotoPath(
  path: string,
  userId: string,
  roomId: string,
  billingMonth: string,
  type: 'water' | 'electricity'
) {
  const prefix = `drafts/${userId}/${roomId}/${billingMonth}/${type}-`
  return path.startsWith(prefix) && /^[0-9a-f-]+\.jpg$/i.test(path.slice(prefix.length))
}

// ─── Save Meter Readings + Generate Bills ────────────────────
export async function saveMeterAndGenerateBills(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const authedUser = await getAuthedUser()
  if (!authedUser) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()

  const billing_month = formData.get('billing_month') as string
  if (!billing_month) return { success: false, message: 'ไม่พบเดือนที่ออกบิล' }

  // Get settings for rates
  const { data: settings } = await supabase
    .from('settings')
    .select('water_unit_price, electricity_unit_price, due_day, trash_fee')
    .eq('id', 1)
    .single()

  const water_rate       = Number(settings?.water_unit_price       ?? 18)
  const electricity_rate = Number(settings?.electricity_unit_price  ?? 8)
  const due_day          = Number(settings?.due_day                 ?? 10)
  const trash_fee        = Number(settings?.trash_fee               ?? 50)

  // A bill for a billing month is always due on the configured day of the following month.
  const due_date = dueDateForBillingMonth(billing_month, due_day)

  const roomIds = formData.getAll('room_ids') as string[]
  if (roomIds.length === 0) return { success: false, message: 'ไม่มีห้องที่ต้องออกบิล' }

  // Fetch wifi_fee per room (batch)
  const { data: roomsData } = await supabase
    .from('rooms')
    .select('id, wifi_fee')
    .in('id', roomIds)
  const wifiMap = Object.fromEntries(
    (roomsData ?? []).map((r) => [r.id, r.wifi_fee])
  )

  const errors: string[] = []
  let successCount = 0

  for (const roomId of roomIds) {
    const contract_id        = formData.get(`room_${roomId}_contract_id`)        as string
    const tenant_id          = formData.get(`room_${roomId}_tenant_id`)           as string
    const rent               = Number(formData.get(`room_${roomId}_rent`)         ?? 0)
    const water_prev         = Number(formData.get(`room_${roomId}_water_prev`)   ?? 0)
    const water_curr         = Number(formData.get(`room_${roomId}_water_curr`)   ?? 0)
    const electricity_prev   = Number(formData.get(`room_${roomId}_electricity_prev`)  ?? 0)
    const electricity_curr   = Number(formData.get(`room_${roomId}_electricity_curr`)  ?? 0)

    // กันค่าที่ไม่ใช่ตัวเลข (พิมพ์ตัวอักษร/OCR เพี้ยน → NaN) ลอดด่านเช็คติดลบไปทำให้ total เป็น NaN
    if (![rent, water_prev, water_curr, electricity_prev, electricity_curr].every(Number.isFinite)) {
      errors.push(`ห้อง ${roomId}: ค่ามิเตอร์หรือค่าเช่าไม่ใช่ตัวเลขที่ถูกต้อง`)
      continue
    }

    const water_units       = water_curr - water_prev
    const electricity_units = electricity_curr - electricity_prev

    if (water_units < 0 || electricity_units < 0) {
      errors.push(`ห้อง ${roomId}: ค่ามิเตอร์ปัจจุบันน้อยกว่าค่าก่อนหน้า`)
      continue
    }

    // 0 หน่วยเป็นค่าปกติ (ห้องไม่ได้ใช้น้ำ/ไฟเดือนนั้น) — ดักเฉพาะค่ามหาศาลที่เป็นการพิมพ์ผิด
    const MAX_UNITS = 100_000
    if (water_units > MAX_UNITS || electricity_units > MAX_UNITS) {
      errors.push(`ห้อง ${roomId}: ค่าหน่วยที่ใช้สูงผิดปกติ (น้ำ ${water_units}, ไฟ ${electricity_units}) — โปรดตรวจสอบ`)
      continue
    }

    // Photos are uploaded directly from the browser to Supabase Storage.
    // This action receives only a small path/URL and never proxies image bytes through Cloudflare.
    const waterImagePath = String(formData.get(`room_${roomId}_water_image_path`) ?? '')
    const electricityImagePath = String(formData.get(`room_${roomId}_elec_image_path`) ?? '')

    if (waterImagePath && !isValidDraftPhotoPath(waterImagePath, authedUser.id, roomId, billing_month, 'water')) {
      errors.push(`ห้อง ${roomId}: ตำแหน่งรูปมิเตอร์น้ำไม่ถูกต้อง`)
      continue
    }
    if (electricityImagePath && !isValidDraftPhotoPath(electricityImagePath, authedUser.id, roomId, billing_month, 'electricity')) {
      errors.push(`ห้อง ${roomId}: ตำแหน่งรูปมิเตอร์ไฟไม่ถูกต้อง`)
      continue
    }
    // Store only the object path. The database RPC keeps the previous value when
    // these are null, and authorized pages create short-lived signed URLs to view it.
    const water_image_url = waterImagePath || null
    const electricity_image_url = electricityImagePath || null

    const water_amount       = water_units * water_rate
    const electricity_amount = electricity_units * electricity_rate
    const wifi_amount        = Number(wifiMap[roomId] ?? 0)
    const trash_amount       = trash_fee

    // Pro-rated rent: if first billing month, charge by days occupied / actual days in month
    const start_date  = formData.get(`room_${roomId}_start_date`) as string | null
    const rent_amount = prorateRent(rent, billing_month, start_date)

    const total_amount = rent_amount + water_amount + electricity_amount + wifi_amount + trash_amount

    const { error: billError } = await supabase.rpc('admin_upsert_meter_and_bill', {
      p_room_id: roomId,
      p_contract_id: contract_id,
      p_tenant_id: tenant_id,
      p_billing_month: billing_month,
      p_due_date: due_date,
      p_water_prev: water_prev,
      p_water_curr: water_curr,
      p_electricity_prev: electricity_prev,
      p_electricity_curr: electricity_curr,
      p_reading_date: bangkokDateKey(),
      p_water_image_url: water_image_url,
      p_electricity_image_url: electricity_image_url,
      p_rent_amount: rent_amount,
      p_water_amount: water_amount,
      p_electricity_amount: electricity_amount,
      p_wifi_amount: wifi_amount,
      p_trash_amount: trash_amount,
      p_total_amount: total_amount,
    })

    if (billError) {
      errors.push(`ออกบิลผิดพลาด: ${billError.message}`)
    } else {
      successCount++
    }
  }

  revalidatePath('/bills')

  if (errors.length > 0) {
    const suffix = successCount > 0 ? ` (สำเร็จ ${successCount} ห้อง)` : ''
    return { success: false, message: `เกิดข้อผิดพลาด: ${errors.join(' | ')}${suffix}` }
  }

  logAudit({ action: 'bill_create', description: `สร้างบิลรอบ ${billing_month} จำนวน ${successCount} ห้อง` }).catch(() => {})

  return { success: true, message: `ออกบิลสำเร็จ ${successCount} ห้อง` }
}

// ─── Update / Edit Bill ──────────────────────────────────────
export type UpdateBillState =
  | { success?: boolean; message?: string }
  | undefined

export async function updateBill(
  _state: UpdateBillState,
  formData: FormData
): Promise<UpdateBillState> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()

  const billId = String(formData.get('bill_id') ?? '').trim()
  if (!billId) return { success: false, message: 'ไม่พบบิล' }

  const num = (k: string) => Math.max(0, Number(formData.get(k) ?? 0) || 0)
  const rent_amount      = num('rent_amount')
  const water_prev       = num('water_prev')
  const water_curr       = num('water_curr')
  const electricity_prev = num('electricity_prev')
  const electricity_curr = num('electricity_curr')
  const wifi_amount      = num('wifi_amount')
  const trash_amount     = num('trash_amount')
  const other_amount     = num('other_amount')
  const other_note       = String(formData.get('other_note') ?? '').trim() || null

  const water_units       = water_curr - water_prev
  const electricity_units = electricity_curr - electricity_prev
  if (water_units < 0 || electricity_units < 0) {
    return { success: false, message: 'ค่ามิเตอร์ปัจจุบันน้อยกว่าค่าก่อนหน้า' }
  }
  // 0 หน่วยเป็นค่าปกติ — ดักเฉพาะค่ามหาศาลที่เป็นการพิมพ์ผิด
  const MAX_UNITS = 100_000
  if (water_units > MAX_UNITS || electricity_units > MAX_UNITS) {
    return { success: false, message: `ค่าหน่วยที่ใช้สูงผิดปกติ (น้ำ ${water_units}, ไฟ ${electricity_units}) — โปรดตรวจสอบ` }
  }

  // ดึงเรตค่าน้ำ/ไฟ + ข้อมูลบิลเดิม
  const [{ data: settings }, { data: bill }] = await Promise.all([
    supabase.from('settings').select('water_unit_price, electricity_unit_price').eq('id', 1).single(),
    supabase
      .from('bills')
      .select('id, tenant_id, room_id, meter_reading_id, due_date, status, rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount, other_amount, other_note, total_amount')
      .eq('id', billId)
      .single(),
  ])
  if (!bill) return { success: false, message: 'ไม่พบบิล' }

  const water_rate       = Number(settings?.water_unit_price      ?? 18)
  const electricity_rate = Number(settings?.electricity_unit_price ?? 8)

  const water_amount       = water_units * water_rate
  const electricity_amount = electricity_units * electricity_rate
  const total_amount = rent_amount + water_amount + electricity_amount + wifi_amount + trash_amount + other_amount

  // คิดสถานะใหม่ตามยอดที่ชำระแล้ว (ยกเว้นบิลที่ยกเลิก)
  let status = bill.status as string
  if (status !== 'cancelled') {
    const { data: payments } = await supabase.from('payments').select('amount').eq('bill_id', billId)
    const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const today = bangkokDateKey()
    if (totalPaid >= total_amount && total_amount > 0) status = 'paid'
    else if (bill.due_date < today) status = 'overdue'
    else status = 'pending'
  }

  const newBillValue = {
    rent_amount,
    water_amount,
    electricity_amount,
    wifi_amount,
    trash_amount,
    other_amount,
    other_note,
    total_amount,
    status,
  }

  const { error } = await supabase.rpc('admin_update_bill', {
    p_bill_id: billId,
    p_water_prev: water_prev,
    p_water_curr: water_curr,
    p_electricity_prev: electricity_prev,
    p_electricity_curr: electricity_curr,
    p_rent_amount: rent_amount,
    p_water_amount: water_amount,
    p_electricity_amount: electricity_amount,
    p_wifi_amount: wifi_amount,
    p_trash_amount: trash_amount,
    p_other_amount: other_amount,
    p_other_note: other_note,
    p_total_amount: total_amount,
    p_status: status,
  })

  if (error) return { success: false, message: error.message }

  logAudit({
    action: 'bill_update',
    entityType: 'bill',
    entityId: billId,
    tenantId: bill.tenant_id,
    roomId: bill.room_id,
    oldValue: bill,
    newValue: { ...newBillValue, bill_id: billId, tenant_id: bill.tenant_id, room_id: bill.room_id },
    description: `แก้ไขบิล ${billId}`,
  }).catch(() => {})

  revalidatePath('/bills')
  revalidatePath(`/bills/${billId}`)
  return { success: true, message: 'แก้ไขบิลเรียบร้อยแล้ว' }
}

// ─── Delete Bill ─────────────────────────────────────────────
export async function deleteBill(billId: string): Promise<{ success: boolean; message?: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()

  const { data: bill } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .single()

  const { error } = await supabase.rpc('admin_delete_bill', { p_bill_id: billId })
  if (error) return { success: false, message: error.message }

  logAudit({
    action: 'bill_delete',
    entityType: 'bill',
    entityId: billId,
    tenantId: bill?.tenant_id ?? null,
    roomId: bill?.room_id ?? null,
    oldValue: bill,
    description: `ลบบิล ${billId}`,
  }).catch(() => {})

  revalidatePath('/bills')
  return { success: true }
}

// ─── Mark Bill Paid ──────────────────────────────────────────
export async function markBillPaid(billId: string): Promise<{ success: boolean; message: string }> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }

  const { data, error } = await createServiceClient().rpc('admin_mark_bill_paid', {
    p_bill_id: billId,
    p_recorded_by: user.id,
  })
  if (error || !data) {
    return { success: false, message: error?.message ?? 'บันทึกรายการชำระไม่สำเร็จ' }
  }
  const payment = data as {
    payment_id: string | null
    amount: number
    tenant_id: string | null
    room_id: string | null
    total_paid: number
    total_amount: number
  }

  logAudit({
    action: 'bill_mark_paid',
    entityType: 'bill',
    entityId: billId,
    tenantId: payment.tenant_id,
    roomId: payment.room_id,
    newValue: {
      payment_id: payment.payment_id,
      amount: Number(payment.amount),
      total_paid: Number(payment.total_paid),
      total_amount: Number(payment.total_amount),
    },
    description: `รับเงินสด ฿${Number(payment.amount).toFixed(2)} (ทำเครื่องหมายชำระแล้ว)`,
  }).catch(() => {})

  revalidatePath('/bills')
  return { success: true, message: 'บันทึกการชำระเงินแล้ว' }
}

// ─── Mark Bill Overdue (batch) ────────────────────────────────
export async function markOverdueBills(): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()
  const today = bangkokDateKey()

  const { error, count } = await supabase
    .from('bills')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', today)

  if (error) return { success: false, message: error.message }

  if ((count ?? 0) > 0) {
    void logAudit({
      action: 'bills_mark_overdue',
      entityType: 'bill',
      description: `ทำเครื่องหมาย ${count} บิลเป็นเกินกำหนด (${today})`,
      newValue: { count, date: today },
    })
  }

  revalidatePath('/bills')
  return { success: true, message: `อัปเดต ${count ?? 0} บิลเป็นเกินกำหนด` }
}

