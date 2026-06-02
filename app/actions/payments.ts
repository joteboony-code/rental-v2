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

  const { error } = await supabase.from('payments').insert({
    bill_id: billId,
    amount,
    payment_method,
    slip_url,
    note,
    paid_at,
    recorded_by: user?.id ?? null,
  })

  if (error) return { success: false, message: `เกิดข้อผิดพลาด: ${error.message}` }

  logAudit({ action: 'payment_create', entityType: 'payment', entityId: billId, description: `บันทึกชำระเงิน ฿${amount.toLocaleString('th-TH')} (${payment_method})` }).catch(() => {})

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
    .select('slip_url')
    .eq('id', paymentId)
    .single()

  await supabase.from('payments').delete().eq('id', paymentId)
  logAudit({ action: 'payment_delete', entityType: 'payment', entityId: paymentId, description: `ลบการชำระเงิน (bill: ${billId})` }).catch(() => {})

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
  revalidatePath('/portal')
}


