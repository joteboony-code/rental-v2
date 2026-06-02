// ค่าคงที่และ type สำหรับเอกสารแนบผู้เช่า
// (แยกออกจากไฟล์ 'use server' เพราะ server action export ได้แค่ async function)

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
