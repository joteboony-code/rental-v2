'use server'

import { revalidatePath } from 'next/cache'
import { logAudit } from '@/app/actions/audit'
import { isMeterBaselineReason, normalizeBillingMonth } from '@/lib/meter-baseline'
import { getAuthedUser } from '@/lib/require-admin'
import { createClient } from '@/lib/supabase/server'

const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type MeterBaselineActionState =
  | { success: boolean; message: string }
  | undefined

async function uploadEvidence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File | null,
  roomId: string,
  billingMonth: string,
  type: 'water' | 'electricity'
) {
  if (!file || file.size === 0) return { url: null, path: null }
  const ext = ALLOWED_IMAGE_TYPES[file.type]
  if (!ext) throw new Error('รูปหลักฐานต้องเป็น JPG, PNG หรือ WebP')
  if (file.size > MAX_IMAGE_SIZE) throw new Error('รูปหลักฐานแต่ละรูปต้องไม่เกิน 2MB')

  const path = `${roomId}/${billingMonth}/baseline-${type}-${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('meter-photos')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (error || !data) throw new Error(error?.message ?? 'อัปโหลดรูปหลักฐานไม่สำเร็จ')
  const { data: publicUrl } = supabase.storage.from('meter-photos').getPublicUrl(data.path)
  return { url: publicUrl.publicUrl, path: data.path }
}

export async function setMeterBaseline(
  _state: MeterBaselineActionState,
  formData: FormData
): Promise<MeterBaselineActionState> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ปรับเลขตั้งต้นมิเตอร์' }

  const roomId = String(formData.get('room_id') ?? '').trim()
  const billingMonth = normalizeBillingMonth(String(formData.get('billing_month') ?? ''))
  const waterBaseline = Number(formData.get('water_baseline'))
  const electricityBaseline = Number(formData.get('electricity_baseline'))
  const reasonCode = String(formData.get('reason_code') ?? '').trim()
  const reasonNote = String(formData.get('reason_note') ?? '').trim()

  if (!UUID_PATTERN.test(roomId)) return { success: false, message: 'กรุณาเลือกห้องให้ถูกต้อง' }
  if (!billingMonth) return { success: false, message: 'กรุณาเลือกรอบบิลให้ถูกต้อง' }
  if (![waterBaseline, electricityBaseline].every(Number.isFinite)) {
    return { success: false, message: 'เลขมิเตอร์ต้องเป็นตัวเลขที่ถูกต้อง' }
  }
  if (waterBaseline < 0 || electricityBaseline < 0) {
    return { success: false, message: 'เลขมิเตอร์ต้องไม่ติดลบ' }
  }
  if (!isMeterBaselineReason(reasonCode)) return { success: false, message: 'กรุณาเลือกเหตุผล' }
  if (reasonCode === 'other' && !reasonNote) return { success: false, message: 'กรุณาระบุเหตุผลเพิ่มเติม' }
  if (reasonNote.length > 500) return { success: false, message: 'รายละเอียดเหตุผลต้องไม่เกิน 500 ตัวอักษร' }

  const supabase = await createClient()
  const [{ data: room }, { data: existingBill }] = await Promise.all([
    supabase.from('rooms').select('id, room_number').eq('id', roomId).maybeSingle(),
    supabase.from('bills').select('id').eq('room_id', roomId).eq('billing_month', billingMonth).limit(1).maybeSingle(),
  ])
  if (!room) return { success: false, message: 'ไม่พบห้องที่เลือก' }
  if (existingBill) return { success: false, message: 'รอบนี้ออกบิลแล้ว จึงไม่สามารถปรับเลขตั้งต้นได้' }

  const uploadedPaths: string[] = []
  try {
    const waterFile = formData.get('water_image') as File | null
    const electricityFile = formData.get('electricity_image') as File | null
    // Upload sequentially so every successful file is tracked and can be
    // removed if a later upload or the database operation fails.
    const waterImage = await uploadEvidence(supabase, waterFile, roomId, billingMonth, 'water')
    if (waterImage.path) uploadedPaths.push(waterImage.path)

    const electricityImage = await uploadEvidence(
      supabase,
      electricityFile,
      roomId,
      billingMonth,
      'electricity'
    )
    if (electricityImage.path) uploadedPaths.push(electricityImage.path)

    const { data: adjustmentId, error } = await supabase.rpc('admin_set_meter_baseline', {
      p_room_id: roomId,
      p_effective_billing_month: billingMonth,
      p_water_baseline: waterBaseline,
      p_electricity_baseline: electricityBaseline,
      p_reason_code: reasonCode,
      p_reason_note: reasonNote || null,
      p_water_image_url: waterImage.url,
      p_electricity_image_url: electricityImage.url,
    })
    if (error) throw new Error(error.message)

    await logAudit({
      action: 'meter_baseline_adjustment',
      entityType: 'meter_baseline_adjustment',
      entityId: String(adjustmentId),
      roomId,
      newValue: { billing_month: billingMonth, water_baseline: waterBaseline, electricity_baseline: electricityBaseline, reason_code: reasonCode, reason_note: reasonNote || null },
      description: `ปรับเลขตั้งต้นมิเตอร์ห้อง ${room.room_number} รอบ ${billingMonth.slice(0, 7)}`,
    })

    revalidatePath('/meter-baselines')
    revalidatePath('/bills/meter')
    return { success: true, message: `บันทึกเลขตั้งต้นห้อง ${room.room_number} เรียบร้อยแล้ว` }
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage.from('meter-photos').remove(uploadedPaths).catch(() => {})
    }
    return { success: false, message: error instanceof Error ? error.message : 'บันทึกเลขตั้งต้นไม่สำเร็จ' }
  }
}

export async function cancelMeterBaseline(adjustmentId: string) {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ยกเลิกรายการ' }
  if (!UUID_PATTERN.test(adjustmentId)) return { success: false, message: 'ไม่พบรายการที่ต้องการยกเลิก' }

  const supabase = await createClient()
  const { data: adjustment } = await supabase
    .from('meter_baseline_adjustments')
    .select('id, room_id, effective_billing_month, water_baseline, electricity_baseline, rooms(room_number)')
    .eq('id', adjustmentId)
    .is('cancelled_at', null)
    .maybeSingle()
  if (!adjustment) return { success: false, message: 'ไม่พบรายการที่ยังใช้งานอยู่' }

  const { error } = await supabase.rpc('admin_cancel_meter_baseline', {
    p_adjustment_id: adjustmentId,
    p_cancellation_note: 'ยกเลิกโดยผู้ดูแลระบบ',
  })
  if (error) return { success: false, message: error.message }

  const room = adjustment.rooms as unknown as { room_number: string } | null
  await logAudit({
    action: 'meter_baseline_adjustment_cancelled',
    entityType: 'meter_baseline_adjustment',
    entityId: adjustmentId,
    roomId: adjustment.room_id,
    oldValue: adjustment,
    description: `ยกเลิกการปรับเลขตั้งต้นมิเตอร์ห้อง ${room?.room_number ?? '-'} รอบ ${adjustment.effective_billing_month.slice(0, 7)}`,
  })

  revalidatePath('/meter-baselines')
  revalidatePath('/bills/meter')
  return { success: true, message: 'ยกเลิกรายการเรียบร้อยแล้ว' }
}
