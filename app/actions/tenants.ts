'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TenantSchema, ContractSchema, type TenantFormState, type ContractFormState } from '@/lib/definitions'
import { logAudit } from './audit'

// ─── Create Tenant ───────────────────────────────────────────
export async function createTenant(
  state: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const raw = {
    full_name:         formData.get('full_name'),
    phone:             formData.get('phone'),
    line_user_id:      formData.get('line_user_id'),
    id_card:           formData.get('id_card'),
    emergency_contact: formData.get('emergency_contact'),
    emergency_phone:   formData.get('emergency_phone'),
    note:              formData.get('note'),
  }

  const parsed = TenantSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tenants')
    .insert(parsed.data)
    .select('id')
    .single()

  if (error) {
    return { message: `เกิดข้อผิดพลาด: ${error.message}` }
  }

  revalidatePath('/tenants')
  redirect(`/tenants/${data.id}`)
}

// ─── Update Tenant ───────────────────────────────────────────
export async function updateTenant(
  id: string,
  state: TenantFormState,
  formData: FormData
): Promise<TenantFormState> {
  const raw = {
    full_name:         formData.get('full_name'),
    phone:             formData.get('phone'),
    line_user_id:      formData.get('line_user_id'),
    id_card:           formData.get('id_card'),
    emergency_contact: formData.get('emergency_contact'),
    emergency_phone:   formData.get('emergency_phone'),
    note:              formData.get('note'),
  }

  const parsed = TenantSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tenants')
    .update(parsed.data)
    .eq('id', id)

  if (error) {
    return { message: `เกิดข้อผิดพลาด: ${error.message}` }
  }

  logAudit({ action: 'tenant_update', entityType: 'tenant', entityId: id, description: `แก้ข้อมูลผู้เช่า ${parsed.data.full_name}`, newValue: parsed.data }).catch(() => {})

  revalidatePath('/tenants')
  revalidatePath(`/tenants/${id}`)
  return { success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' }
}

// ─── Delete Tenant ───────────────────────────────────────────
export async function deleteTenant(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('tenants').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      return { error: 'ไม่สามารถลบได้ เนื่องจากมีข้อมูลอื่นอ้างอิงผู้เช่านี้อยู่ (บิล, สัญญา หรือประวัติการชำระ)' }
    }
    return { error: error.message }
  }
  revalidatePath('/tenants')
  redirect('/tenants')
}

// ─── Create Contract ─────────────────────────────────────────
export async function createContract(
  state: ContractFormState,
  formData: FormData
): Promise<ContractFormState> {
  const raw = {
    room_id:      formData.get('room_id'),
    tenant_id:    formData.get('tenant_id'),
    start_date:   formData.get('start_date'),
    end_date:     formData.get('end_date') || undefined,
    monthly_rent: formData.get('monthly_rent'),
    deposit_paid: formData.get('deposit_paid'),
    note:         formData.get('note'),
  }

  const parsed = ContractSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()

  // ตรวจว่าห้องนี้ว่างหรือไม่
  const { data: room } = await supabase
    .from('rooms')
    .select('status, monthly_rent')
    .eq('id', parsed.data.room_id)
    .single()

  if (!room) return { message: 'ไม่พบห้องที่เลือก' }
  if (room.status === 'occupied') return { message: 'ห้องนี้มีผู้เช่าอยู่แล้ว' }

  const { error } = await supabase.from('contracts').insert({
    ...parsed.data,
    status: 'active',
  })

  if (error) {
    return { message: `เกิดข้อผิดพลาด: ${error.message}` }
  }

  revalidatePath('/tenants')
  revalidatePath('/rooms')
  return { success: true, message: 'สร้างสัญญาเรียบร้อยแล้ว' }
}

// ─── Upload Contract Documents ───────────────────────────────
export async function uploadContractImages(
  tenantId: string,
  formData: FormData
): Promise<{ success: boolean; message: string; urls?: string[] }> {
  const supabase = await createClient()

  const files = formData.getAll('contract_images') as File[]
  const validFiles = files.filter((f) => f && f.size > 0)
  if (validFiles.length === 0) {
    return { success: false, message: 'ไม่พบไฟล์ที่อัพโหลด' }
  }

  const newUrls: string[] = []

  for (const file of validFiles) {
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${tenantId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

    const { data: upload, error: uploadError } = await supabase.storage
      .from('contract-documents')
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

    if (upload && !uploadError) {
      const { data: urlData } = supabase.storage.from('contract-documents').getPublicUrl(upload.path)
      newUrls.push(urlData.publicUrl)
    }
  }

  if (newUrls.length === 0) {
    return { success: false, message: 'อัพโหลดไม่สำเร็จ' }
  }

  // Append new URLs to existing array
  const { data: tenant } = await supabase
    .from('tenants')
    .select('contract_images')
    .eq('id', tenantId)
    .single()

  const existing: string[] = (tenant?.contract_images as string[] | null) ?? []

  await supabase
    .from('tenants')
    .update({ contract_images: [...existing, ...newUrls] })
    .eq('id', tenantId)

  revalidatePath(`/tenants/${tenantId}`)
  return { success: true, message: `อัพโหลดสำเร็จ ${newUrls.length} ไฟล์`, urls: newUrls }
}

// ─── Delete Contract Document ────────────────────────────────
export async function deleteContractImage(
  tenantId: string,
  url: string
): Promise<void> {
  const supabase = await createClient()

  // Remove from DB array
  const { data: tenant } = await supabase
    .from('tenants')
    .select('contract_images')
    .eq('id', tenantId)
    .single()

  const existing: string[] = (tenant?.contract_images as string[] | null) ?? []
  await supabase
    .from('tenants')
    .update({ contract_images: existing.filter((u) => u !== url) })
    .eq('id', tenantId)

  // Remove from storage
  try {
    const urlObj = new URL(url)
    const parts = urlObj.pathname.split('/contract-documents/')
    if (parts[1]) {
      await supabase.storage.from('contract-documents').remove([parts[1]])
    }
  } catch {}

  revalidatePath(`/tenants/${tenantId}`)
}

// ─── Terminate Contract ───────────────────────────────────────
export async function terminateContract(contractId: string, tenantId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contracts')
    .update({ status: 'terminated', end_date: new Date().toISOString().split('T')[0] })
    .eq('id', contractId)

  if (error) throw new Error(error.message)
  revalidatePath('/tenants')
  revalidatePath(`/tenants/${tenantId}`)
  revalidatePath('/rooms')
}


