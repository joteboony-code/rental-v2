'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RoomSchema, RoomFormState } from '@/lib/definitions'
import { getAuthedUser } from '@/lib/require-admin'
import { logAudit } from './audit'

async function getOwnerOrThrow() {
  const user = await getAuthedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  return { supabase, user }
}

export async function createRoom(
  state: RoomFormState,
  formData: FormData
): Promise<RoomFormState> {
  const { supabase } = await getOwnerOrThrow()

  const validated = RoomSchema.safeParse({
    room_number:  formData.get('room_number'),
    floor:        formData.get('floor') || null,
    room_type:    formData.get('room_type'),
    size_sqm:     formData.get('size_sqm') || null,
    monthly_rent: formData.get('monthly_rent'),
    deposit:      formData.get('deposit') || 0,
    wifi_fee:     formData.get('wifi_fee') || null,
    status:       formData.get('status'),
    reserved_tenant_id:  formData.get('reserved_tenant_id') || null,
    reserved_name:       formData.get('reserved_name') || '',
    reserved_phone:      formData.get('reserved_phone') || '',
    reserved_deposit:    formData.get('reserved_deposit') || null,
    reservation_expires: formData.get('reservation_expires') || '',
    reservation_note:    formData.get('reservation_note') || '',
    description:  formData.get('description'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const roomData = normalizeReservationFields(validated.data)

  const { data: newRoom, error } = await supabase.from('rooms').insert(roomData).select('id').single()
  if (error) {
    if (error.code === '23505') return { message: 'เลขห้องนี้มีในระบบแล้ว' }
    return { message: error.message }
  }

  logAudit({ action: 'room_create', entityType: 'room', entityId: newRoom?.id ?? null, roomId: newRoom?.id ?? null, description: `เพิ่มห้อง ${validated.data.room_number}` }).catch(() => {})

  return { success: true, message: 'เพิ่มห้องเรียบร้อยแล้ว' }
}

export async function updateRoom(
  id: string,
  state: RoomFormState,
  formData: FormData
): Promise<RoomFormState> {
  const { supabase } = await getOwnerOrThrow()

  const validated = RoomSchema.safeParse({
    room_number:  formData.get('room_number'),
    floor:        formData.get('floor') || null,
    room_type:    formData.get('room_type'),
    size_sqm:     formData.get('size_sqm') || null,
    monthly_rent: formData.get('monthly_rent'),
    deposit:      formData.get('deposit') || 0,
    wifi_fee:     formData.get('wifi_fee') || null,
    status:       formData.get('status'),
    reserved_tenant_id:  formData.get('reserved_tenant_id') || null,
    reserved_name:       formData.get('reserved_name') || '',
    reserved_phone:      formData.get('reserved_phone') || '',
    reserved_deposit:    formData.get('reserved_deposit') || null,
    reservation_expires: formData.get('reservation_expires') || '',
    reservation_note:    formData.get('reservation_note') || '',
    description:  formData.get('description'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const roomData = normalizeReservationFields(validated.data)

  const { error } = await supabase
    .from('rooms')
    .update(roomData)
    .eq('id', id)

  if (error) return { message: error.message }

  logAudit({ action: 'room_update', entityType: 'room', entityId: id, roomId: id, description: `แก้ไขห้อง ${validated.data.room_number}` }).catch(() => {})

  return { success: true, message: 'แก้ไขห้องเรียบร้อยแล้ว' }
}

function normalizeReservationFields(data: Record<string, unknown>) {
  if (data.status !== 'reserved') {
    return {
      ...data,
      reserved_tenant_id: null,
      reserved_name: null,
      reserved_phone: null,
      reserved_deposit: null,
      reservation_expires: null,
      reservation_note: null,
    }
  }

  return {
    ...data,
    reserved_tenant_id: data.reserved_tenant_id ?? null,
    reserved_name: String(data.reserved_name ?? '').trim() || null,
    reserved_phone: String(data.reserved_phone ?? '').trim() || null,
    reserved_deposit: data.reserved_deposit ?? null,
    reservation_expires: String(data.reservation_expires ?? '').trim() || null,
    reservation_note: String(data.reservation_note ?? '').trim() || null,
  }
}

export async function clearRoomReservation(roomId: string): Promise<{ success: boolean; message?: string }> {
  const { supabase } = await getOwnerOrThrow()
  const { error } = await supabase
    .from('rooms')
    .update({
      status: 'available',
      reserved_tenant_id: null,
      reserved_name: null,
      reserved_phone: null,
      reserved_deposit: null,
      reservation_expires: null,
      reservation_note: null,
    })
    .eq('id', roomId)

  if (error) return { success: false, message: error.message }

  logAudit({ action: 'reservation_clear', entityType: 'room', entityId: roomId, roomId, description: `ยกเลิกจองห้อง` }).catch(() => {})

  return { success: true }
}

export async function convertReservationToTenant(
  roomId: string,
  startDate?: string,
): Promise<{ success: boolean; message?: string; tenantId?: string }> {
  const { supabase } = await getOwnerOrThrow()
  const { data: room } = await supabase
    .from('rooms')
    .select('room_number, monthly_rent, reserved_tenant_id, reserved_name, reserved_phone, reserved_deposit, reservation_note, status')
    .eq('id', roomId)
    .single()

  if (!room) return { success: false, message: 'ไม่พบห้อง' }
  if (room.status !== 'reserved') return { success: false, message: 'ห้องนี้ไม่ได้อยู่ในสถานะจอง' }

  let tenantId: string

  if (room.reserved_tenant_id) {
    // ผู้เช่าที่มีในระบบแล้ว — ใช้ ID เดิม
    tenantId = room.reserved_tenant_id
  } else {
    // ผู้จองใหม่ — สร้าง tenant ใหม่จากชื่อ/โทร
    const reservedName = String(room.reserved_name ?? '').trim()
    if (!reservedName) return { success: false, message: 'กรุณากรอกชื่อผู้จองก่อนแปลงเป็นผู้เช่า' }

    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        full_name: reservedName,
        phone: room.reserved_phone ?? null,
        note: room.reservation_note
          ? `มาจากการจองห้อง ${room.room_number}: ${room.reservation_note}`
          : `มาจากการจองห้อง ${room.room_number}`,
      })
      .select('id')
      .single()
    if (tenantError || !newTenant) return { success: false, message: tenantError?.message ?? 'สร้างผู้เช่าไม่สำเร็จ' }
    tenantId = newTenant.id
  }

  const today = new Date().toISOString().slice(0, 10)
  const { error: contractError } = await supabase.from('contracts').insert({
    room_id: roomId,
    tenant_id: tenantId,
    start_date: startDate || today,
    monthly_rent: Number(room.monthly_rent),
    deposit_paid: Number(room.reserved_deposit ?? 0),
    status: 'active',
    note: 'สร้างจากการแปลงการจองเป็นสัญญาเช่า',
  })
  if (contractError) return { success: false, message: contractError.message }

  const { error: roomError } = await supabase
    .from('rooms')
    .update({
      status: 'occupied',
      reserved_tenant_id: null,
      reserved_name: null,
      reserved_phone: null,
      reserved_deposit: null,
      reservation_expires: null,
      reservation_note: null,
    })
    .eq('id', roomId)
  if (roomError) return { success: false, message: roomError.message }

  logAudit({ action: 'reservation_convert', entityType: 'room', entityId: roomId, roomId, tenantId, description: `แปลงการจองห้อง ${room.room_number} เป็นสัญญาเช่า` }).catch(() => {})

  return { success: true, tenantId }
}

export async function deleteRoom(id: string): Promise<{ success: boolean; message?: string }> {
  const { supabase } = await getOwnerOrThrow()

  // อนุญาตลบเฉพาะห้องเลข 31 ขึ้นไป (ห้อง 1–30 เป็นห้องจริง ห้ามลบ)
  const { data: room } = await supabase
    .from('rooms')
    .select('room_number')
    .eq('id', id)
    .maybeSingle()

  if (!room) return { success: false, message: 'ไม่พบห้อง' }
  if ((parseInt(room.room_number) || 0) < 31) {
    return { success: false, message: 'ลบได้เฉพาะห้องเลข 31 ขึ้นไป' }
  }

  // cascade: ลบข้อมูลที่อ้างถึงห้องนี้ตามลำดับ FK
  const { data: bills } = await supabase.from('bills').select('id').eq('room_id', id)
  const billIds = (bills ?? []).map((b) => b.id)

  if (billIds.length > 0) {
    const { error } = await supabase.from('payments').delete().in('bill_id', billIds)
    if (error) return { success: false, message: `ลบประวัติชำระไม่สำเร็จ: ${error.message}` }
  }

  for (const [table, msg] of [
    ['bills', 'บิล'],
    ['meter_readings', 'มิเตอร์'],
    ['contracts', 'สัญญา'],
  ] as const) {
    const { error } = await supabase.from(table).delete().eq('room_id', id)
    if (error) return { success: false, message: `ลบ${msg}ไม่สำเร็จ: ${error.message}` }
  }

  const { error } = await supabase.from('rooms').delete().eq('id', id)
  if (error) return { success: false, message: error.message }

  logAudit({ action: 'room_delete', entityType: 'room', description: `ลบห้อง ${room.room_number}` }).catch(() => {})

  return { success: true }
}


