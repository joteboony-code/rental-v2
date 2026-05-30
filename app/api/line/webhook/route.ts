import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/crypto-secrets'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'

type SupabaseServiceClient = ReturnType<typeof createServiceClient>

type LineMessagingConfig = {
  channelAccessToken: string
  channelSecret: string | null
  liffId: string | null
  appUrl: string | null
  ownerLineUserId: string | null
}

type LineEvent = {
  type: string
  replyToken?: string
  source: { userId: string; type: string }
  message?: { id: string; type: string; text?: string }
}

type SlipOkResponse = {
  success: boolean
  message?: string
  code?: number
  data?: {
    amount: number
    transDate: string
    transTime: string
    sender?: { name?: string }
  }
}

async function getLineMessagingConfig(): Promise<LineMessagingConfig | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, encrypted_channel_secret, line_liff_id, app_url, owner_line_user_id')
    .eq('dorm_id', DEFAULT_DORM_ID)
    .maybeSingle()

  if (!data?.encrypted_channel_access_token) return null

  return {
    channelAccessToken: await decryptSecret(data.encrypted_channel_access_token),
    channelSecret: data.encrypted_channel_secret ? await decryptSecret(data.encrypted_channel_secret) : null,
    liffId: data.line_liff_id ?? null,
    appUrl: data.app_url ?? null,
    ownerLineUserId: data.owner_line_user_id ?? null,
  }
}

async function isValidSignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const sig = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0))
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(body))
}

async function replyMessage(replyToken: string, token: string, messages: object[]) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  })
  if (!res.ok) throw new Error(`LINE reply API ${res.status}: ${await res.text()}`)
}

async function pushMessage(to: string | null, token: string, messages: object[]) {
  if (!to) return
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
  if (!res.ok) throw new Error(`LINE push API ${res.status}: ${await res.text()}`)
}

async function notifyOwner(lineConfig: LineMessagingConfig, text: string) {
  try {
    await pushMessage(lineConfig.ownerLineUserId, lineConfig.channelAccessToken, [{ type: 'text', text }])
  } catch (error) {
    console.error('[LINE webhook] owner notify failed:', error)
  }
}

async function getLineImageBlob(messageId: string, token: string): Promise<{ blob: Blob; contentType: string } | null> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  const blob = await res.blob()
  return { blob, contentType: blob.type || 'image/jpeg' }
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatSlipDate(transDate: string, transTime: string) {
  try {
    const [dd, mm, yyyy] = transDate.split('/')
    const year = Number(yyyy) > 2500 ? Number(yyyy) - 543 : Number(yyyy)
    return new Date(`${year}-${mm}-${dd}T${transTime}`)
  } catch {
    return null
  }
}

async function syncBillStatus(supabase: SupabaseServiceClient, billId: string) {
  const { data: bill, error: billError } = await supabase
    .from('bills')
    .select('total_amount, status')
    .eq('id', billId)
    .single()

  if (billError || !bill) {
    return { paid: false, warning: billError?.message ?? 'ไม่พบบิล' }
  }

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('amount')
    .eq('bill_id', billId)

  if (paymentsError) return { paid: false, warning: paymentsError.message }

  const totalPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)
  const paid = totalPaid >= Number(bill.total_amount)

  if (paid && bill.status !== 'paid') {
    const { error } = await supabase.from('bills').update({ status: 'paid' }).eq('id', billId)
    if (error) return { paid, warning: error.message }
  } else if (!paid && bill.status === 'paid') {
    const { error } = await supabase.from('bills').update({ status: 'pending' }).eq('id', billId)
    if (error) return { paid, warning: error.message }
  }

  return { paid, warning: null as string | null }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'LINE webhook' })
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  let lineConfig: LineMessagingConfig | null = null
  try {
    lineConfig = await getLineMessagingConfig()
  } catch (error) {
    console.error('[LINE webhook] config error:', error)
    return NextResponse.json({ ok: true })
  }

  if (!lineConfig) return NextResponse.json({ ok: true })

  if (lineConfig.channelSecret) {
    const valid = await isValidSignature(bodyText, signature, lineConfig.channelSecret)
    if (!valid) return NextResponse.json({ ok: true })
  }

  let payload: { events: LineEvent[] }
  try {
    payload = JSON.parse(bodyText) as { events: LineEvent[] }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await processEvents(payload.events ?? [], lineConfig)
  return NextResponse.json({ ok: true })
}

async function processEvents(events: LineEvent[], lineConfig: LineMessagingConfig) {
  const supabase = createServiceClient()
  const token = lineConfig.channelAccessToken

  for (const event of events) {
    try {
      const lineUserId = event.source.userId

      if (event.type === 'follow' && event.replyToken) {
        await replyMessage(event.replyToken, token, [{
          type: 'text',
          text: 'ยินดีต้อนรับ 🏠\n\nกรุณาสแกน QR จากห้องเช่าของท่านเพื่อจับคู่บัญชี LINE กับห้องพัก\n\nเมื่อจับคู่แล้ว ท่านจะได้รับใบแจ้งค่าเช่าและแจ้งเตือนต่างๆ ทาง LINE นี้',
        }])
        continue
      }

      if (event.type !== 'message' || !event.message || !event.replyToken) continue

      if (event.message.type === 'image') {
        await handleSlipImage(lineUserId, event.message.id, event.replyToken, supabase, lineConfig)
        continue
      }

      if (event.message.type === 'text' && event.message.text) {
        await handleTextMessage(lineUserId, event.message.text.trim(), event.replyToken, supabase, lineConfig)
      }
    } catch (error) {
      console.error('[LINE webhook] event error:', error)
    }
  }
}

async function handleSlipImage(
  lineUserId: string,
  messageId: string,
  replyToken: string,
  supabase: SupabaseServiceClient,
  lineConfig: LineMessagingConfig
) {
  const token = lineConfig.channelAccessToken

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, full_name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  if (!tenant) {
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: 'ยังไม่ได้จับคู่บัญชี\nส่งรหัส 6 หลักที่ได้รับจากเจ้าของห้องเพื่อจับคู่ก่อน',
    }])
    return
  }

  const { data: activeContract } = await supabase
    .from('contracts')
    .select('rooms(room_number)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle()

  type RoomJoin = { room_number: string }
  const room = activeContract?.rooms as unknown as RoomJoin | null
  const roomLabel = room?.room_number ? `ห้อง ${room.room_number}` : 'ไม่พบห้อง active'

  const { data: settings } = await supabase
    .from('settings')
    .select('slipok_api_key, slipok_branch_id')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.slipok_api_key || !settings?.slipok_branch_id) {
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: `ได้รับสลิปของคุณแล้ว (${tenant.full_name})\nกรุณารอเจ้าของห้องยืนยัน`,
    }])
    await notifyOwner(lineConfig, `ได้รับสลิปจาก ${tenant.full_name} (${roomLabel}) แต่ยังไม่ได้ตั้งค่า SlipOK ครบ`)
    return
  }

  const image = await getLineImageBlob(messageId, token)
  if (!image) {
    await replyMessage(replyToken, token, [{ type: 'text', text: 'ไม่สามารถรับรูปสลิปได้ กรุณาส่งใหม่อีกครั้ง' }])
    await notifyOwner(lineConfig, `รับรูปสลิปจาก ${tenant.full_name} (${roomLabel}) ไม่สำเร็จ`)
    return
  }

  const slipFd = new FormData()
  slipFd.append('files', new File([image.blob], 'slip.jpg', { type: image.contentType }))
  slipFd.append('log', 'true')

  const slipRes = await fetch(
    `https://api.slipok.com/api/line/apikey/${encodeURIComponent(settings.slipok_branch_id)}`,
    {
      method: 'POST',
      headers: { 'x-authorization': settings.slipok_api_key },
      body: slipFd,
    }
  )

  let slipJson: SlipOkResponse
  try {
    slipJson = await slipRes.json() as SlipOkResponse
  } catch {
    slipJson = { success: false, message: `SlipOK response ไม่ถูกต้อง (HTTP ${slipRes.status})` }
  }

  if (!slipRes.ok || !slipJson.success || !slipJson.data) {
    const reason = slipJson.message
      ? `${slipJson.message}${slipJson.code ? ` (${slipJson.code})` : ''}`
      : `SlipOK ตรวจไม่ผ่าน (HTTP ${slipRes.status})`
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: `ตรวจสลิปไม่ผ่าน\n${reason}\n\nกรุณาตรวจสอบและส่งใหม่ หรือติดต่อเจ้าของห้อง`,
    }])
    await notifyOwner(lineConfig, `สลิปตรวจไม่ผ่าน\nผู้เช่า: ${tenant.full_name}\n${roomLabel}\nเหตุผล: ${reason}`)
    return
  }

  const { amount, transDate, transTime } = slipJson.data
  const senderName = slipJson.data.sender?.name ?? ''
  const paidDate = formatSlipDate(transDate, transTime)
  const thDate = paidDate
    ? paidDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : transDate

  const arrayBuffer = await image.blob.arrayBuffer()
  const ext = image.contentType.split('/')[1] || 'jpg'
  const path = `line/${tenant.id}/${Date.now()}.${ext}`
  const { data: upload, error: uploadError } = await supabase.storage
    .from('payment-slips')
    .upload(path, arrayBuffer, { contentType: image.contentType, upsert: false })

  if (uploadError || !upload) {
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: `ตรวจสลิปผ่านแล้ว แต่ระบบอัปโหลดสลิปไม่สำเร็จ\nกรุณาติดต่อเจ้าของห้อง`,
    }])
    await notifyOwner(lineConfig, `สลิปตรวจผ่านแต่อัปโหลดไม่สำเร็จ\nผู้เช่า: ${tenant.full_name}\n${roomLabel}\nยอด: ฿${fmt(amount)}\nError: ${uploadError?.message ?? 'unknown error'}`)
    return
  }

  const { data: urlData } = supabase.storage.from('payment-slips').getPublicUrl(upload.path)
  const slipUrl = urlData.publicUrl

  const { data: bills, error: billsError } = await supabase
    .from('bills')
    .select('id, total_amount, billing_month, due_date, status')
    .eq('tenant_id', tenant.id)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: false })
    .limit(3)

  if (billsError) {
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: `ตรวจสลิปผ่านแล้ว แต่ระบบค้นหาบิลไม่สำเร็จ\nกรุณาติดต่อเจ้าของห้อง`,
    }])
    await notifyOwner(lineConfig, `สลิปตรวจผ่านแต่ค้นหาบิลไม่สำเร็จ\nผู้เช่า: ${tenant.full_name}\n${roomLabel}\nยอด: ฿${fmt(amount)}\nError: ${billsError.message}`)
    return
  }

  const matchingBill = bills?.find((bill) => Math.abs(Number(bill.total_amount) - amount) < 1)

  if (!matchingBill) {
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: `ตรวจสลิปผ่านแล้ว\nยอดเงิน: ฿${fmt(amount)}\nวันที่: ${thDate} ${transTime}\n\nแต่ยอดไม่ตรงกับบิลที่ค้างชำระ กรุณาติดต่อเจ้าของห้อง`,
    }])
    await notifyOwner(lineConfig, `สลิปตรวจผ่านแต่ยอดไม่ตรงกับบิลค้างชำระ\nผู้เช่า: ${tenant.full_name}\n${roomLabel}\nยอดสลิป: ฿${fmt(amount)}\nผู้โอน: ${senderName || '-'}`)
    return
  }

  const paidAt = paidDate?.toISOString() ?? new Date().toISOString()
  const { error: paymentError } = await supabase.from('payments').insert({
    bill_id: matchingBill.id,
    amount,
    payment_method: 'transfer',
    slip_url: slipUrl,
    note: `สลิปจาก LINE${senderName ? ` (${senderName})` : ''}`,
    paid_at: paidAt,
  })

  if (paymentError) {
    await replyMessage(replyToken, token, [{
      type: 'text',
      text: `ตรวจสลิปผ่านแล้ว แต่ระบบบันทึกการชำระเงินไม่สำเร็จ\nกรุณาติดต่อเจ้าของห้อง`,
    }])
    await notifyOwner(lineConfig, `สลิปตรวจผ่านแต่บันทึก payment ไม่สำเร็จ\nผู้เช่า: ${tenant.full_name}\n${roomLabel}\nยอด: ฿${fmt(amount)}\nError: ${paymentError.message}`)
    return
  }

  const statusSync = await syncBillStatus(supabase, matchingBill.id)
  const billingMonth = new Date(matchingBill.billing_month).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  })

  const statusText = statusSync.warning
    ? `บันทึกแล้ว แต่ sync สถานะบิลไม่สำเร็จ: ${statusSync.warning}`
    : statusSync.paid
    ? 'บันทึกแล้ว และอัปเดตสถานะบิลเป็นชำระแล้ว'
    : 'บันทึกแล้ว แต่ยอดรวมยังไม่ครบยอดบิล'

  let replyText = `ตรวจสลิปผ่าน\n\nยอดเงิน: ฿${fmt(amount)}\nวันที่: ${thDate} ${transTime}\n`
  if (senderName) replyText += `ผู้โอน: ${senderName}\n`
  replyText += `\nตรงกับค่าเช่าเดือน ${billingMonth}\n${statusText}`

  await replyMessage(replyToken, token, [{ type: 'text', text: replyText }])
  await notifyOwner(lineConfig, `สลิปถูกต้องและบันทึกแล้ว\nผู้เช่า: ${tenant.full_name}\n${roomLabel}\nเดือน: ${billingMonth}\nยอด: ฿${fmt(amount)}\nผู้โอน: ${senderName || '-'}\nสถานะ: ${statusText}`)
}

async function handleTextMessage(
  lineUserId: string,
  _text: string,
  replyToken: string,
  supabase: SupabaseServiceClient,
  lineConfig: LineMessagingConfig
) {
  const token = lineConfig.channelAccessToken

  const { data: existing } = await supabase
    .from('tenants')
    .select('full_name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  await replyMessage(replyToken, token, [{
    type: 'text',
    text: existing
      ? `บัญชีของคุณ (${existing.full_name}) จับคู่กับห้องแล้ว\nส่งรูปสลิปเพื่อแจ้งชำระค่าเช่าได้เลย`
      : 'กรุณาสแกน QR จากห้องเช่าของท่านเพื่อจับคู่บัญชี LINE\n\nหากมีปัญหา กรุณาติดต่อเจ้าของห้อง',
  }])
  void lineConfig
}
