'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RoomSchema, RoomFormState } from '@/lib/definitions'

async function getOwnerOrThrow() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
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
    description:  formData.get('description'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { error } = await supabase.from('rooms').insert(validated.data)
  if (error) {
    if (error.code === '23505') return { message: 'เลขห้องนี้มีในระบบแล้ว' }
    return { message: error.message }
  }

  revalidatePath('/rooms')
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
    description:  formData.get('description'),
  })

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors }
  }

  const { error } = await supabase
    .from('rooms')
    .update(validated.data)
    .eq('id', id)

  if (error) return { message: error.message }

  revalidatePath('/rooms')
  return { success: true, message: 'แก้ไขห้องเรียบร้อยแล้ว' }
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

  revalidatePath('/rooms')
  return { success: true }
}


