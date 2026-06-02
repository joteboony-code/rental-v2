'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logAudit } from './audit'

async function uploadMeterPhoto(
  supabase: SupabaseClient,
  file: File,
  roomId: string,
  billingMonth: string,
  type: 'water' | 'electricity'
): Promise<string | null> {
  if (!file || file.size === 0) return null
  const ext  = file.name.split('.').pop() ?? 'jpg'
  const path = `${roomId}/${billingMonth}/${type}.${ext}`
  const buf  = await file.arrayBuffer()
  const { data: up } = await supabase.storage
    .from('meter-photos')
    .upload(path, buf, { contentType: file.type, upsert: true })
  if (!up) return null
  return supabase.storage.from('meter-photos').getPublicUrl(up.path).data.publicUrl
}

// ─── Save Meter Readings + Generate Bills ────────────────────
export async function saveMeterAndGenerateBills(
  formData: FormData
): Promise<{ success: boolean; message: string }> {
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

  // Due date = same month as billing_month, on due_day
  const [yearStr, monthStr] = billing_month.split('-')
  const due_date = `${yearStr}-${monthStr}-${String(due_day).padStart(2, '0')}`

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

  const { data: { user } } = await supabase.auth.getUser()
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

    const water_units       = water_curr - water_prev
    const electricity_units = electricity_curr - electricity_prev

    if (water_units < 0 || electricity_units < 0) {
      errors.push(`ห้อง ${roomId}: ค่ามิเตอร์ปัจจุบันน้อยกว่าค่าก่อนหน้า`)
      continue
    }

    // Upload meter photos (optional)
    const waterImgFile = formData.get(`room_${roomId}_water_image`) as File | null
    const elecImgFile  = formData.get(`room_${roomId}_elec_image`)  as File | null
    const [water_image_url, electricity_image_url] = await Promise.all([
      waterImgFile ? uploadMeterPhoto(supabase, waterImgFile, roomId, billing_month, 'water') : Promise.resolve(null),
      elecImgFile  ? uploadMeterPhoto(supabase, elecImgFile,  roomId, billing_month, 'electricity') : Promise.resolve(null),
    ])

    // Upsert meter reading
    const meterPayload: Record<string, unknown> = {
      room_id: roomId,
      billing_month,
      water_prev,
      water_curr,
      electricity_prev,
      electricity_curr,
      recorded_by: user?.id ?? null,
    }
    if (water_image_url)       meterPayload.water_image_url       = water_image_url
    if (electricity_image_url) meterPayload.electricity_image_url = electricity_image_url

    const { data: meter, error: meterError } = await supabase
      .from('meter_readings')
      .upsert(meterPayload, { onConflict: 'room_id,billing_month' })
      .select('id')
      .single()

    if (meterError || !meter) {
      errors.push(`บันทึกมิเตอร์ผิดพลาด: ${meterError?.message ?? 'unknown'}`)
      continue
    }

    const water_amount       = water_units * water_rate
    const electricity_amount = electricity_units * electricity_rate
    const wifi_amount        = Number(wifiMap[roomId] ?? 0)
    const trash_amount       = trash_fee

    // Pro-rated rent: if first billing month, divide by 30 × days occupied
    const start_date  = formData.get(`room_${roomId}_start_date`) as string | null
    let rent_amount   = rent
    if (start_date && start_date.slice(0, 7) === billing_month.slice(0, 7)) {
      const [sy, sm, sdStr] = billing_month.split('-')
      const startDay    = parseInt((start_date.split('-')[2]) ?? '1')
      const daysInMonth = new Date(parseInt(sy), parseInt(sm), 0).getDate()
      const daysOccupied = daysInMonth - startDay + 1
      if (startDay > 1) {
        rent_amount = Math.round(rent * daysOccupied / 30)
      }
    }

    const total_amount = rent_amount + water_amount + electricity_amount + wifi_amount + trash_amount

    // Upsert bill
    const { error: billError } = await supabase.from('bills').upsert(
      {
        contract_id,
        room_id: roomId,
        tenant_id,
        meter_reading_id: meter.id,
        billing_month,
        due_date,
        rent_amount: rent_amount,
        water_amount,
        electricity_amount,
        wifi_amount,
        trash_amount,
        other_amount: 0,
        total_amount,
        status: 'pending',
      },
      { onConflict: 'contract_id,billing_month' }
    )

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
  const supabase = await createClient()

  const billId = String(formData.get('bill_id') ?? '').trim()
  if (!billId) return { success: false, message: 'ไม่พบบิล' }

  const num = (k: string) => Number(formData.get(k) ?? 0) || 0
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

  // อัปเดตเลขมิเตอร์ (units เป็น generated column — set แค่ prev/curr)
  if (bill.meter_reading_id) {
    const { error: meterError } = await supabase
      .from('meter_readings')
      .update({ water_prev, water_curr, electricity_prev, electricity_curr })
      .eq('id', bill.meter_reading_id)
    if (meterError) return { success: false, message: `อัปเดตมิเตอร์ผิดพลาด: ${meterError.message}` }
  }

  // คิดสถานะใหม่ตามยอดที่ชำระแล้ว (ยกเว้นบิลที่ยกเลิก)
  let status = bill.status as string
  if (status !== 'cancelled') {
    const { data: payments } = await supabase.from('payments').select('amount').eq('bill_id', billId)
    const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const today = new Date().toISOString().split('T')[0]
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

  const { error } = await supabase
    .from('bills')
    .update(newBillValue)
    .eq('id', billId)

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
  const supabase = await createClient()

  const { data: bill } = await supabase
    .from('bills')
    .select('*')
    .eq('id', billId)
    .single()

  // ลบประวัติชำระก่อน (FK payments → bills)
  const { error: payErr } = await supabase.from('payments').delete().eq('bill_id', billId)
  if (payErr) return { success: false, message: `ลบประวัติชำระไม่สำเร็จ: ${payErr.message}` }

  const { error } = await supabase.from('bills').delete().eq('id', billId)
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
  const supabase = await createClient()
  const { data: bill } = await supabase
    .from('bills')
    .select('id, tenant_id, room_id, status')
    .eq('id', billId)
    .single()

  const { error } = await supabase
    .from('bills')
    .update({ status: 'paid' })
    .eq('id', billId)

  if (error) return { success: false, message: error.message }
  logAudit({
    action: 'bill_update',
    entityType: 'bill',
    entityId: billId,
    tenantId: bill?.tenant_id ?? null,
    roomId: bill?.room_id ?? null,
    oldValue: bill,
    newValue: { ...bill, status: 'paid' },
    description: `ทำเครื่องหมายบิล ${billId} เป็นชำระแล้ว`,
  }).catch(() => {})

  revalidatePath('/bills')
  return { success: true, message: 'บันทึกการชำระเงินแล้ว' }
}

// ─── Mark Bill Overdue (batch) ────────────────────────────────
export async function markOverdueBills(): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { error, count } = await supabase
    .from('bills')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', today)

  if (error) return { success: false, message: error.message }
  revalidatePath('/bills')
  return { success: true, message: `อัปเดต ${count ?? 0} บิลเป็นเกินกำหนด` }
}

