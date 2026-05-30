'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RepairSchema, type RepairFormState, type RepairStatus } from '@/lib/definitions'

// ─── Create Repair Request ────────────────────────────────────
export async function createRepair(
  state: RepairFormState,
  formData: FormData
): Promise<RepairFormState> {
  const raw = {
    room_id:     formData.get('room_id'),
    tenant_id:   formData.get('tenant_id') || undefined,
    title:       formData.get('title'),
    description: formData.get('description'),
    priority:    formData.get('priority'),
  }

  const parsed = RepairSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()

  // Upload photo if provided
  let photo_url: string | null = null
  const photoFile = formData.get('photo') as File | null
  if (photoFile && photoFile.size > 0) {
    const buffer = await photoFile.arrayBuffer()
    const ext    = photoFile.name.split('.').pop() ?? 'jpg'
    const path   = `${Date.now()}.${ext}`

    const { data: upload } = await supabase.storage
      .from('repair-photos')
      .upload(path, buffer, { contentType: photoFile.type })

    if (upload) {
      const { data: urlData } = supabase.storage.from('repair-photos').getPublicUrl(upload.path)
      photo_url = urlData.publicUrl
    }
  }

  const { data, error } = await supabase
    .from('repair_requests')
    .insert({
      ...parsed.data,
      tenant_id: parsed.data.tenant_id || null,
      photo_url,
    })
    .select('id')
    .single()

  if (error) return { message: `เกิดข้อผิดพลาด: ${error.message}` }

  revalidatePath('/repairs')
  redirect(`/repairs/${data.id}`)
}

// ─── Update Repair Status ────────────────────────────────────
export async function updateRepairStatus(
  id: string,
  status: RepairStatus,
  adminNote: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('repair_requests')
    .update({ status, admin_note: adminNote || null })
    .eq('id', id)

  if (error) return { success: false, message: error.message }
  revalidatePath('/repairs')
  revalidatePath(`/repairs/${id}`)
  return { success: true, message: 'อัปเดตสถานะแล้ว' }
}

// ─── Delete Repair Request ────────────────────────────────────
export async function deleteRepair(id: string): Promise<void> {
  const supabase = await createClient()

  // Remove photo from storage
  const { data } = await supabase
    .from('repair_requests')
    .select('photo_url')
    .eq('id', id)
    .single()

  if (data?.photo_url) {
    try {
      const url   = new URL(data.photo_url)
      const parts = url.pathname.split('/repair-photos/')
      if (parts[1]) {
        await supabase.storage.from('repair-photos').remove([parts[1]])
      }
    } catch {}
  }

  await supabase.from('repair_requests').delete().eq('id', id)
  revalidatePath('/repairs')
  redirect('/repairs')
}


