'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'
import { decryptSecret } from '@/lib/crypto-secrets'

export type AgreementData = {
  tenant: {
    id: string
    full_name: string
    phone: string | null
    id_card: string | null
    address: string | null
  }
  contract: {
    id: string
    start_date: string
    end_date: string | null
    monthly_rent: number
    deposit_paid: number
    agreement_pdf_url: string | null
    signed_at: string | null
    room: { room_number: string; floor: number | null } | null
  }
  settings: {
    water_unit_price: number
    electricity_unit_price: number
    due_day: number
    owner_name: string
    owner_id_card: string | null
    owner_address: string
    owner_signature_url: string | null
  }
}

export async function getSignAgreementData(
  lineUserId: string,
  contractId: string
): Promise<{ success: true; data: AgreementData } | { success: false; message: string }> {
  const trimmed = lineUserId.trim()
  if (!trimmed || !contractId) return { success: false, message: 'ข้อมูลไม่ครบ' }

  const supabase = createServiceClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, full_name, phone, id_card, address')
    .eq('line_user_id', trimmed)
    .maybeSingle()

  if (!tenant) return { success: false, message: 'ไม่พบข้อมูลผู้เช่า กรุณาจับคู่ห้องก่อน' }

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, start_date, end_date, monthly_rent, deposit_paid, agreement_pdf_url, signed_at, rooms(room_number, floor)')
    .eq('id', contractId)
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!contract) return { success: false, message: 'ไม่พบสัญญาเช่าที่ใช้งานอยู่' }

  const { data: settings } = await supabase
    .from('settings')
    .select('water_unit_price, electricity_unit_price, due_day, owner_name, owner_id_card, owner_address, owner_signature_url')
    .eq('id', 1)
    .maybeSingle()

  type SettingsRow = {
    water_unit_price?: number | null
    electricity_unit_price?: number | null
    due_day?: number | null
    owner_name?: string | null
    owner_id_card?: string | null
    owner_address?: string | null
    owner_signature_url?: string | null
  }
  const s = settings as SettingsRow | null

  return {
    success: true,
    data: {
      tenant: {
        id: tenant.id,
        full_name: tenant.full_name,
        phone: tenant.phone,
        id_card: tenant.id_card,
        address: tenant.address,
      },
      contract: {
        id: contract.id,
        start_date: contract.start_date,
        end_date: contract.end_date,
        monthly_rent: Number(contract.monthly_rent),
        deposit_paid: Number(contract.deposit_paid),
        agreement_pdf_url: (contract as { agreement_pdf_url?: string | null }).agreement_pdf_url ?? null,
        signed_at: (contract as { signed_at?: string | null }).signed_at ?? null,
        room: contract.rooms as unknown as { room_number: string; floor: number | null } | null,
      },
      settings: {
        water_unit_price: Number(s?.water_unit_price ?? 18),
        electricity_unit_price: Number(s?.electricity_unit_price ?? 8),
        due_day: Number(s?.due_day ?? 5),
        owner_name: s?.owner_name || 'นายบุญรัตน์ อาส',
        owner_id_card: s?.owner_id_card ?? null,
        owner_address: s?.owner_address || '58/10 ม.9 ถ.บางนโยม อ.พานทอง จ.ชลบุรี',
        owner_signature_url: s?.owner_signature_url ?? null,
      },
    },
  }
}

export async function submitSignedAgreement(
  formData: FormData
): Promise<{ success: boolean; message: string; pdfUrl?: string }> {
  const lineUserId = String(formData.get('lineUserId') ?? '').trim()
  const contractId = String(formData.get('contractId') ?? '').trim()
  const idCard     = String(formData.get('id_card') ?? '').trim() || null
  const address    = String(formData.get('address') ?? '').trim() || null
  const pdfFile    = formData.get('pdf') as File | null

  if (!lineUserId || !contractId) return { success: false, message: 'ข้อมูลไม่ครบ' }
  if (!pdfFile || pdfFile.size === 0) return { success: false, message: 'ไม่พบไฟล์ PDF' }

  const supabase = createServiceClient()

  const { data: tenant } = await supabase
    .from('tenants').select('id').eq('line_user_id', lineUserId).maybeSingle()
  if (!tenant) return { success: false, message: 'ไม่พบข้อมูลผู้เช่า' }

  const { data: contract } = await supabase
    .from('contracts').select('id').eq('id', contractId).eq('tenant_id', tenant.id).maybeSingle()
  if (!contract) return { success: false, message: 'ไม่พบสัญญาเช่า' }

  // Update tenant info ถ้ามีข้อมูลใหม่
  const tenantUpdate: Record<string, string> = {}
  if (idCard) tenantUpdate.id_card = idCard
  if (address) tenantUpdate.address = address
  if (Object.keys(tenantUpdate).length > 0) {
    await supabase.from('tenants').update(tenantUpdate).eq('id', tenant.id)
  }

  // Upload PDF ไป Supabase Storage
  const buffer = await pdfFile.arrayBuffer()
  const path = `agreements/${contractId}/${Date.now()}.pdf`
  const { data: upload, error: uploadError } = await supabase.storage
    .from('tenant-documents')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError || !upload) {
    return { success: false, message: `อัพโหลด PDF ไม่สำเร็จ: ${uploadError?.message ?? 'unknown'}` }
  }

  const pdfUrl = supabase.storage.from('tenant-documents').getPublicUrl(upload.path).data.publicUrl

  // บันทึก URL + วันที่เซ็น ใน contracts
  await supabase
    .from('contracts')
    .update({ agreement_pdf_url: pdfUrl, signed_at: new Date().toISOString() })
    .eq('id', contractId)

  // แจ้ง owner ทาง LINE
  try {
    await notifyOwnerAgreementSigned({ contractId, tenantId: tenant.id, pdfUrl })
  } catch (e) {
    console.error('notify agreement signed failed', e)
  }

  return { success: true, message: 'ลงนามสัญญาเรียบร้อยแล้ว', pdfUrl }
}

async function notifyOwnerAgreementSigned({
  contractId,
  tenantId,
  pdfUrl,
}: {
  contractId: string
  tenantId: string
  pdfUrl: string
}) {
  const supabase = createServiceClient()

  const [cfgRes, tenantRes, contractRes] = await Promise.all([
    supabase
      .from('line_integrations')
      .select('encrypted_channel_access_token, owner_line_user_id, app_url')
      .eq('dorm_id', DEFAULT_DORM_ID)
      .maybeSingle(),
    supabase.from('tenants').select('full_name').eq('id', tenantId).maybeSingle(),
    supabase
      .from('contracts')
      .select('rooms(room_number)')
      .eq('id', contractId)
      .maybeSingle(),
  ])

  const cfg = cfgRes.data
  if (!cfg?.encrypted_channel_access_token || !cfg.owner_line_user_id) return

  const token = await decryptSecret(cfg.encrypted_channel_access_token)
  const tenantName = tenantRes.data?.full_name ?? '-'
  const roomNumber = (contractRes.data?.rooms as unknown as { room_number: string } | null)?.room_number ?? '-'
  const appUrl = (cfg.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const tenantUrl = appUrl ? `${appUrl}/tenants` : null

  const lines = [
    '✅ ผู้เช่าลงนามสัญญาแล้ว',
    `ห้อง: ${roomNumber}`,
    `ผู้เช่า: ${tenantName}`,
    '',
    `ดาวน์โหลด PDF: ${pdfUrl}`,
  ]
  if (tenantUrl) lines.push(`จัดการ: ${tenantUrl}`)

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      to: cfg.owner_line_user_id,
      messages: [{ type: 'text', text: lines.join('\n') }],
    }),
  })
}

// ──────────────────────────────────────────────
// Admin: ส่งลิงก์สัญญาให้ผู้เช่าทาง LINE
// ──────────────────────────────────────────────
export async function sendAgreementLinkToTenant(
  tenantId: string,
  contractId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceClient()

  const [tenantRes, cfgRes, contractRes] = await Promise.all([
    supabase.from('tenants').select('full_name, line_user_id').eq('id', tenantId).maybeSingle(),
    supabase
      .from('line_integrations')
      .select('encrypted_channel_access_token, line_liff_id, app_url')
      .eq('dorm_id', DEFAULT_DORM_ID)
      .maybeSingle(),
    supabase.from('contracts').select('rooms(room_number)').eq('id', contractId).maybeSingle(),
  ])

  const tenant = tenantRes.data
  if (!tenant?.line_user_id) return { success: false, message: 'ผู้เช่ายังไม่ได้จับคู่ LINE' }

  const cfg = cfgRes.data
  if (!cfg?.encrypted_channel_access_token) return { success: false, message: 'ยังไม่ได้ตั้งค่า LINE' }

  const token = await decryptSecret(cfg.encrypted_channel_access_token)
  const appUrl = (cfg.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  const liffId = cfg.line_liff_id
  const roomNumber = (contractRes.data?.rooms as unknown as { room_number: string } | null)?.room_number ?? '-'

  // ถ้ามี LIFF ให้ส่ง signContractId เป็น query param ใน liff.state (pattern เดียวกับ registerToken)
  const signPath = `/portal/sign-agreement?contractId=${contractId}`
  let signUrl: string
  if (liffId) {
    signUrl = `https://liff.line.me/${liffId}?liff.state=${encodeURIComponent(`?signContractId=${contractId}`)}`
  } else {
    signUrl = `${appUrl}${signPath}`
  }

  const text = [
    `สวัสดีครับ คุณ${tenant.full_name}`,
    `กรุณาลงนามสัญญาเช่าห้อง ${roomNumber} ผ่านลิงก์ด้านล่างนี้`,
    '',
    signUrl,
    '',
    'กรุณาตรวจสอบข้อมูลให้ครบถ้วนก่อนลงนามครับ',
  ].join('\n')

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: tenant.line_user_id, messages: [{ type: 'text', text }] }),
  })

  if (!res.ok) {
    const body = await res.text()
    return { success: false, message: `ส่ง LINE ไม่สำเร็จ: ${body}` }
  }

  return { success: true, message: `ส่งลิงก์สัญญาไปยัง LINE ของ ${tenant.full_name} แล้ว` }
}

// ──────────────────────────────────────────────
// Admin: อัพโหลดลายเซ็นเจ้าของหอ
// ──────────────────────────────────────────────
export async function uploadOwnerSignature(
  formData: FormData
): Promise<{ success: boolean; message: string; url?: string }> {
  const supabase = createServiceClient()
  const file = formData.get('signature') as File | null
  if (!file || file.size === 0) return { success: false, message: 'ไม่พบไฟล์' }

  const ext = file.name.split('.').pop() ?? 'png'
  const buffer = await file.arrayBuffer()
  const { data: upload, error } = await supabase.storage
    .from('tenant-documents')
    .upload(`signatures/owner_signature.${ext}`, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (error || !upload) return { success: false, message: `อัพโหลดไม่สำเร็จ: ${error?.message ?? 'unknown'}` }

  const url = supabase.storage.from('tenant-documents').getPublicUrl(upload.path).data.publicUrl

  await supabase.from('settings').update({ owner_signature_url: url }).eq('id', 1)

  return { success: true, message: 'บันทึกลายเซ็นเรียบร้อยแล้ว', url }
}
