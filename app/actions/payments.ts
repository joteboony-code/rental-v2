'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendPaymentReceiptNotification } from '@/lib/line-notify'
import { logAudit } from './audit'
import { getAuthedUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { storageObjectPath } from '@/lib/storage-path'

const MAX_SLIP_SIZE = 5 * 1024 * 1024
const ALLOWED_SLIP_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
const VALID_PAYMENT_METHODS = ['cash', 'transfer', 'promptpay'] as const
type PaymentMethod = typeof VALID_PAYMENT_METHODS[number]
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function recordPayment(
  billId: string,
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const user = await getAuthedUser()
  if (!user) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  if (!UUID_PATTERN.test(billId)) return { success: false, message: 'ข้อมูลบิลไม่ถูกต้อง' }

  const supabase = await createClient()

  const rawAmount = Number(formData.get('amount'))
  const amount = Math.round(rawAmount * 100) / 100 // round to 2 decimal places
  const rawMethod = (formData.get('payment_method') as string) || 'transfer'
  const payment_method: PaymentMethod = (VALID_PAYMENT_METHODS as readonly string[]).includes(rawMethod)
    ? (rawMethod as PaymentMethod)
    : 'transfer'
  const note = (formData.get('note') as string) || null
  const paid_at = (formData.get('paid_at') as string) || new Date().toISOString()

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: 'กรุณากรอกจำนวนเงินให้ถูกต้อง' }
  }
  if (amount > 1_000_000) {
    return { success: false, message: 'จำนวนเงินสูงเกินไป กรุณาตรวจสอบ' }
  }

  let slip_url: string | null = null
  let slipPath: string | null = null
  const slipFile = formData.get('slip') as File | null

  if (slipFile && slipFile.size > 0) {
    if (slipFile.size > MAX_SLIP_SIZE) {
      return { success: false, message: 'ไฟล์สลิปต้องไม่เกิน 5 MB' }
    }
    const ext = ALLOWED_SLIP_TYPES[slipFile.type]
    if (!ext) {
      return { success: false, message: 'รองรับเฉพาะไฟล์ JPEG, PNG, WebP, PDF' }
    }
    const buffer = await slipFile.arrayBuffer()
    const path = `${billId}/${Date.now()}.${ext}`

    const { data: upload, error: uploadError } = await supabase.storage
      .from('payment-slips')
      .upload(path, buffer, { contentType: slipFile.type, upsert: false })

    if (uploadError || !upload) {
      return {
        success: false,
        message: `อัปโหลดสลิปไม่สำเร็จ: ${uploadError?.message ?? 'unknown error'}`,
      }
    }

    const { data: urlData } = supabase.storage.from('payment-slips').getPublicUrl(upload.path)
    slip_url = urlData.publicUrl
    slipPath = upload.path
  }

  const { data, error } = await createServiceClient().rpc('admin_record_payment', {
    p_bill_id: billId,
    p_amount: amount,
    p_payment_method: payment_method,
    p_slip_url: slip_url,
    p_note: note,
    p_paid_at: paid_at,
    p_recorded_by: user.id,
  })
  if (error || !data) {
    // Validation errors prove the transaction did not commit, so its freshly
    // uploaded slip is safe to remove. Keep the file on ambiguous network errors
    // because the transaction may have committed even if the response was lost.
    if (slipPath && ['22023', '23505', 'P0002'].includes(error?.code ?? '')) {
      await supabase.storage.from('payment-slips').remove([slipPath]).catch(() => {})
    }
    const detail = error?.message ?? 'ไม่พบข้อมูลการชำระเงินที่บันทึก'
    const message = detail.includes('exceeds remaining')
      ? 'ยอดเงินเกินยอดค้างชำระ'
      : detail.includes('already paid')
        ? 'บิลนี้ชำระครบแล้ว'
        : detail.includes('duplicate')
          ? 'การชำระนี้อาจถูกบันทึกไปแล้ว กรุณาตรวจสอบก่อนบันทึกซ้ำ'
          : `เกิดข้อผิดพลาด: ${detail}`
    return { success: false, message }
  }

  const payment = data as {
    payment_id: string
    tenant_id: string | null
    room_id: string | null
    total_paid: number
    total_amount: number
    bill_paid: boolean
  }

  await logAudit({
    action: 'payment_create',
    entityType: 'payment',
    entityId: payment.payment_id,
    tenantId: payment.tenant_id,
    roomId: payment.room_id,
    newValue: {
      id: payment.payment_id,
      bill_id: billId,
      amount,
      payment_method,
      slip_url,
      note,
      paid_at,
      recorded_by: user.id,
      tenant_id: payment.tenant_id,
      room_id: payment.room_id,
    },
    description: `บันทึกชำระเงิน ฿${amount.toLocaleString('th-TH')} (${payment_method})`,
  }).catch(() => {})
  await sendPaymentReceiptNotification(
    billId,
    Number(payment.total_paid),
    Number(payment.total_amount)
  ).catch(() => {})

  revalidatePath('/bills')
  revalidatePath(`/bills/${billId}`)
  revalidatePath('/bills/payments')
  revalidatePath('/bills/history')
  revalidatePath('/portal')

  return {
    success: true,
    message: payment.bill_paid
      ? 'บันทึกการชำระเงินแล้ว และอัปเดตสถานะบิลเป็นชำระแล้ว'
      : 'บันทึกการชำระเงินแล้ว',
  }
}

export async function deletePayment(paymentId: string, billId: string): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) return { success: false, message: 'ไม่มีสิทธิ์ใช้งาน' }
  if (!UUID_PATTERN.test(paymentId) || !UUID_PATTERN.test(billId)) {
    return { success: false, message: 'ข้อมูลการชำระเงินไม่ถูกต้อง' }
  }
  const supabase = await createClient()

  const { data, error } = await createServiceClient().rpc('admin_delete_payment', {
    p_payment_id: paymentId,
    p_bill_id: billId,
  })
  if (error || !data) {
    return { success: false, message: `ลบไม่สำเร็จ: ${error?.message ?? 'ไม่พบรายการชำระเงิน'}` }
  }
  const payment = data as {
    payment_id: string
    amount: number
    payment_method: string
    slip_url: string | null
    slip_ref: string | null
    note: string | null
    paid_at: string
    tenant_id: string | null
    room_id: string | null
    slip_in_use: boolean
  }

  await logAudit({
    action: 'payment_delete',
    entityType: 'payment',
    entityId: paymentId,
    tenantId: payment.tenant_id,
    roomId: payment.room_id,
    oldValue: { ...payment, id: payment.payment_id, bill_id: billId },
    description: `ลบการชำระเงิน ฿${Number(payment.amount).toLocaleString('th-TH')} (bill: ${billId})`,
  }).catch(() => {})

  if (payment.slip_url && !payment.slip_in_use) {
    const path = storageObjectPath(payment.slip_url, 'payment-slips')
    if (path) await supabase.storage.from('payment-slips').remove([path])
  }

  revalidatePath('/bills')
  revalidatePath(`/bills/${billId}`)
  revalidatePath('/bills/payments')
  revalidatePath('/bills/history')
  revalidatePath('/portal')
  return { success: true, message: 'ลบการชำระเงินแล้ว' }
}


