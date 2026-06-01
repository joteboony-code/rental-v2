'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type DocumentType = 'id_card' | 'contract' | 'room_before' | 'deposit_proof' | 'other'

export type TenantDocument = {
  id: string
  tenant_id: string | null
  room_id: string | null
  contract_id: string | null
  document_type: DocumentType
  file_url: string
  file_name: string | null
  uploaded_by: string | null
  created_at: string
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  id_card:       'บัตรประชาชน',
  contract:      'สัญญาเช่า',
  room_before:   'รูปห้องก่อนเข้า',
  deposit_proof: 'หลักฐานเงินประกัน',
  other:         'เอกสารอื่น ๆ',
}

export async function getTenantDocuments(tenantId: string): Promise<TenantDocument[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenant_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as TenantDocument[]
}

export async function uploadTenantDocument(
  tenantId: string,
  formData: FormData
): Promise<{ success: boolean; message: string; document?: TenantDocument }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const file = formData.get('file') as File | null
  const documentType = (String(formData.get('document_type') ?? 'other') || 'other') as DocumentType
  const roomId = String(formData.get('room_id') ?? '').trim() || null
  const contractId = String(formData.get('contract_id') ?? '').trim() || null

  if (!file || file.size === 0) {
    return { success: false, message: 'ไม่พบไฟล์ที่อัพโหลด' }
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${tenantId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data: upload, error: uploadError } = await supabase.storage
    .from('tenant-documents')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (uploadError || !upload) {
    return { success: false, message: `อัพโหลดไม่สำเร็จ: ${uploadError?.message ?? 'unknown error'}` }
  }

  const { data: urlData } = supabase.storage.from('tenant-documents').getPublicUrl(upload.path)

  const { data: inserted, error } = await supabase
    .from('tenant_documents')
    .insert({
      tenant_id:     tenantId,
      room_id:       roomId,
      contract_id:   contractId,
      document_type: documentType,
      file_url:      urlData.publicUrl,
      file_name:     file.name,
      uploaded_by:   user?.id ?? null,
    })
    .select('*')
    .single()

  if (error) {
    // เก็บไฟล์ขึ้นแล้วแต่บันทึก DB ไม่ได้ — ลบไฟล์ทิ้งเพื่อไม่ให้ค้าง
    await supabase.storage.from('tenant-documents').remove([upload.path]).catch(() => {})
    return { success: false, message: `บันทึกไม่สำเร็จ: ${error.message}` }
  }

  revalidatePath(`/tenants/${tenantId}`)
  return { success: true, message: 'อัพโหลดเอกสารเรียบร้อยแล้ว', document: inserted as unknown as TenantDocument }
}

export async function deleteTenantDocument(
  documentId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('tenant_documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (!doc) return { success: false, message: 'ไม่พบเอกสารนี้' }

  // ลบไฟล์ออกจาก storage
  try {
    const urlObj = new URL(doc.file_url)
    const parts = urlObj.pathname.split('/tenant-documents/')
    if (parts[1]) {
      await supabase.storage.from('tenant-documents').remove([decodeURIComponent(parts[1])])
    }
  } catch {}

  const { error } = await supabase.from('tenant_documents').delete().eq('id', documentId)
  if (error) return { success: false, message: `ลบไม่สำเร็จ: ${error.message}` }

  if (doc.tenant_id) revalidatePath(`/tenants/${doc.tenant_id}`)
  return { success: true, message: 'ลบเอกสารแล้ว' }
}
