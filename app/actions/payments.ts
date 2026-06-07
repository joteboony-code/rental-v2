'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendPaymentConfirmedNotification, sendPaymentReceiptNotification } from './line'
import { logAudit } from './audit'

export async function recordPayment(
  billId: string,
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  const amount = Number(formData.get('amount'))
  const payment_method = (formData.get('payment_method') as string) || 'cash'
  const note = (formData.get('note') as string) || null
  const paid_at = (formData.get('paid_at') as string) || new Date().toISOString()

  if (!amount || amount <= 0) {
    return { success: false, message: 'กรุณากรอกจำนวนเงิน' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: billMeta } = await supabase
    .from('bills')
    .select('tenant_id, room_id')
    .eq('id', billId)
    .single()

  let slip_url: string | null = null
  const slipFile = formData.get('slip') as File | null

  if (slipFile && slipFile.size > 0) {
    const buffer = await slipFile.arrayBuffer()
    const ext = slipFile.name.split('.').pop() ?? 'jpg'
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
  }

  const paymentPayload = {
    bill_id: billId,
    amount,
    payment_method,
    slip_url,
    note,
    paid_at,
    recorded_by: user?.id ?? null,
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .insert(paymentPayload)
    .select('id')
    .single()

  if (error || !payment) return { success: false, message: `เกิดข้อผิดพลาด: ${error?.message ?? 'ไม่พบข้อมูลการชำระเงินที่บันทึก'}` }

  logAudit({
    action: 'payment_create',
    entityType: 'payment',
    entityId: payment.id,
    tenantId: billMeta?.tenant_id ?? null,
    roomId: billMeta?.room_id ?? null,
    newValue: { ...paymentPayload, id: payment.id, tenant_id: billMeta?.tenant_id ?? null, room_id: billMeta?.room_id ?? null },
    description: `บันทึกชำระเงิน ฿${amount.toLocaleString('th-TH')} (${payment_method})`,
  }).catch(() => {})

  const { data: bill, error: billError } = await supabase
    .from('bills')
    .select('total_amount, status')
    .eq('id', billId)
    .single()

  let billPaid = false
  let syncWarning: string | null = null
  if (billError) {
    syncWarning = ` แต่ตรวจสถานะบิลไม่สำเร็จ: ${billError.message}`
  } else if (bill) {
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount')
      .eq('bill_id', billId)

    if (paymentsError) {
      syncWarning = ` แต่รวมยอดชำระเพื่อตรวจสถานะบิลไม่สำเร็จ: ${paymentsError.message}`
    } else {
      const totalPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)
      billPaid = totalPaid >= Number(bill.total_amount)

      if (billPaid && bill.status !== 'paid') {
        const { error: statusError } = await supabase.from('bills').update({ status: 'paid' }).eq('id', billId)
        if (statusError) {
          syncWarning = ` แต่เปลี่ยนสถานะบิลเป็นชำระแล้วไม่สำเร็จ: ${statusError.message}`
        } else {
          sendPaymentReceiptNotification(billId, totalPaid, Number(bill.total_amount)).catch(() => {})
        }
      } else if (!billPaid && bill.status !== 'paid') {
        // partial payment — notify tenant of remaining amount
        sendPaymentReceiptNotification(billId, totalPaid, Number(bill.total_amount)).catch(() => {})
      } else if (!billPaid && bill.status === 'paid') {
        const { error: statusError } = await supabase.from('bills').update({ status: 'pending' }).eq('id', billId)
        if (statusError) syncWarning = ` แต่เปลี่ยนสถานะบิลกลับเป็นรอดำเนินการไม่สำเร็จ: ${statusError.message}`
      }
    }
  }

  revalidatePath('/bills')
  revalidatePath(`/bills/${billId}`)
  revalidatePath('/bills/payments')
  revalidatePath('/bills/history')
  revalidatePath('/portal')

  return {
    success: true,
    message: syncWarning
      ? `บันทึกการชำระเงินแล้ว${syncWarning}`
      : billPaid
      ? 'บันทึกการชำระเงินแล้ว และอัปเดตสถานะบิลเป็นชำระแล้ว'
      : 'บันทึกการชำระเงินแล้ว',
  }
}

export async function deletePayment(paymentId: string, billId: string): Promise<void> {
  const supabase = await createClient()

  const { data: payment } = await supabase
    .from('payments')
    .select('id, bill_id, amount, payment_method, slip_url, slip_ref, note, paid_at, bills(tenant_id, room_id)')
    .eq('id', paymentId)
    .single()

  await supabase.from('payments').delete().eq('id', paymentId)
  type PaymentBillJoin = { tenant_id: string | null; room_id: string | null }
  const billJoin = payment?.bills as unknown as PaymentBillJoin | null
  logAudit({
    action: 'payment_delete',
    entityType: 'payment',
    entityId: paymentId,
    tenantId: billJoin?.tenant_id ?? null,
    roomId: billJoin?.room_id ?? null,
    oldValue: payment ? {
      id: payment.id,
      bill_id: payment.bill_id,
      tenant_id: billJoin?.tenant_id ?? null,
      room_id: billJoin?.room_id ?? null,
      amount: payment.amount,
      payment_method: payment.payment_method,
      slip_url: payment.slip_url,
      slip_ref: payment.slip_ref,
      note: payment.note,
      paid_at: payment.paid_at,
    } : { id: paymentId, bill_id: billId },
    description: `ลบการชำระเงิน ฿${Number(payment?.amount ?? 0).toLocaleString('th-TH')} (bill: ${billId})`,
  }).catch(() => {})

  if (payment?.slip_url) {
    try {
      const url = new URL(payment.slip_url)
      const parts = url.pathname.split('/payment-slips/')
      if (parts[1]) {
        await supabase.storage.from('payment-slips').remove([parts[1]])
      }
    } catch {}
  }

  const { data: bill } = await supabase
    .from('bills')
    .select('total_amount, status')
    .eq('id', billId)
    .single()

  if (bill?.status === 'paid') {
    const { data: remaining } = await supabase
      .from('payments')
      .select('amount')
      .eq('bill_id', billId)
    const totalPaid = (remaining ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)
    if (totalPaid < Number(bill.total_amount)) {
      await supabase.from('bills').update({ status: 'pending' }).eq('id', billId)
    }
  }

  revalidatePath('/bills')
  revalidatePath(`/bills/${billId}`)
  revalidatePath('/bills/payments')
  revalidatePath('/bills/history')
  revalidatePath('/portal')
}


