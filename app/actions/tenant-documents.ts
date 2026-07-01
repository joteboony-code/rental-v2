'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { type DocumentType, type TenantDocument } from '@/lib/tenant-documents'
import { getAuthedUser } from '@/lib/require-admin'
import { createSignedStorageUrl, storageObjectPath } from '@/lib/storage-urls'

const MAX_DOC_SIZE = 10 * 1024 * 1024
const ALLOWED_DOC_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
const VALID_DOC_TYPES = ['id_card', 'contract', 'room_before', 'deposit_proof', 'other'] as const

export async function getTenantDocuments(tenantId: string): Promise<TenantDocument[]> {
  if (!(await getAuthedUser())) return []
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('tenant_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  return Promise.all(
    ((data ?? []) as unknown as TenantDocument[]).map(async (document) => ({
      ...document,
      file_url:
        (await createSignedStorageUrl(supabase, 'tenant-documents', document.file_url)) ?? '',
    }))
  )
}

export async function uploadTenantDocument(
  tenantId: string,
  formData: FormData
): Promise<{ success: boolean; message: string; document?: TenantDocument }> {
  const user = await getAuthedUser()
  if (!user) {
    return { success: false, message: 'Unauthorized' }
  }
  const supabase = createServiceClient()

  const file = formData.get('file') as File | null
  const rawDocType = String(formData.get('document_type') ?? 'other') || 'other'
  const documentType = (VALID_DOC_TYPES.includes(rawDocType as DocumentType) ? rawDocType : 'other') as DocumentType
  const roomId = String(formData.get('room_id') ?? '').trim() || null
  const contractId = String(formData.get('contract_id') ?? '').trim() || null

  if (!file || file.size === 0) {
    return { success: false, message: 'ไม่พบไฟล์ที่อัพโหลด' }
  }
  if (file.size > MAX_DOC_SIZE) {
    return { success: false, message: 'ไฟล์ต้องไม่เกิน 10 MB' }
  }
  const ext = ALLOWED_DOC_TYPES[file.type]
  if (!ext) {
    return { success: false, message: 'รองรับเฉพาะไฟล์ JPEG, PNG, WebP, PDF' }
  }

  const path = `${tenantId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data: upload, error: uploadError } = await supabase.storage
    .from('tenant-documents')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (uploadError || !upload) {
    return { success: false, message: `อัพโหลดไม่สำเร็จ: ${uploadError?.message ?? 'unknown error'}` }
  }

  const { data: inserted, error } = await supabase
    .from('tenant_documents')
    .insert({
      tenant_id:     tenantId,
      room_id:       roomId,
      contract_id:   contractId,
      document_type: documentType,
      file_url:      upload.path,
      file_name:     file.name,
      uploaded_by:   user.id,
    })
    .select('*')
    .single()

  if (error) {
    // เก็บไฟล์ขึ้นแล้วแต่บันทึก DB ไม่ได้ — ลบไฟล์ทิ้งเพื่อไม่ให้ค้าง
    await supabase.storage.from('tenant-documents').remove([upload.path]).catch(() => {})
    return { success: false, message: `บันทึกไม่สำเร็จ: ${error.message}` }
  }

  const document = inserted as unknown as TenantDocument
  document.file_url =
    (await createSignedStorageUrl(supabase, 'tenant-documents', document.file_url)) ?? ''

  return { success: true, message: 'อัพโหลดเอกสารเรียบร้อยแล้ว', document }
}

export async function deleteTenantDocument(
  documentId: string
): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) {
    return { success: false, message: 'Unauthorized' }
  }
  const supabase = createServiceClient()

  const { data: doc } = await supabase
    .from('tenant_documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (!doc) return { success: false, message: 'ไม่พบเอกสารนี้' }

  const path = storageObjectPath(doc.file_url, 'tenant-documents')
  if (path) await supabase.storage.from('tenant-documents').remove([path])

  const { error } = await supabase.from('tenant_documents').delete().eq('id', documentId)
  if (error) return { success: false, message: `ลบไม่สำเร็จ: ${error.message}` }

  return { success: true, message: 'ลบเอกสารแล้ว' }
}
