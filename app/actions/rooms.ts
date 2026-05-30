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

export async function deleteRoom(id: string) {
  const { supabase } = await getOwnerOrThrow()

  const { error } = await supabase.from('rooms').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/rooms')
}


