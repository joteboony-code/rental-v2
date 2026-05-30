import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/crypto-secrets'
import { DEFAULT_DORM_ID } from '@/lib/line-integration'
import { buildBillPortalUrl } from '@/lib/portal-url'

type SupabaseClient = ReturnType<typeof createServiceClient>

type LineConfig = {
  channelAccessToken: string
  channelSecret: string | null
  liffId: string | null
  appUrl: string | null
  ownerLineUserId: string | null
}

type LineEvent = {
  type: string
  replyToken?: string
  source: { userId: string }
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
    ref?: string
    sender?: { name?: string }
  }
}

const SEP = '━━━━━━━━━━━━━━'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

function thaiMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
}

async function getLineConfig(): Promise<LineConfig | null> {
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

async function isValidSignature(body: string, sig: string, secret: string) {
  if (!sig) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0))
  return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body))
}

async function getDisplayName(lineUserId: string, token: string): Promise<string> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return ''
    const data = await res.json() as { displayName?: string }
    return data.displayName ?? ''
  } catch {
    return ''
  }
}

async function reply(replyToken: string, token: string, messages: object[]) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  })
}

async function push(to: string | null, token: string, messages: object[]) {
  if (!to) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  })
}

async function notifyOwner(cfg: LineConfig, text: string) {
  if (!cfg.ownerLineUserId) return
  try { await push(cfg.ownerLineUserId, cfg.channelAccessToken, [{ type: 'text', text }]) } catch { /* silent */ }
}

function buildPortalFlex(portalUrl: string) {
  return {
    type: 'flex', altText: 'ดูบิล / ชำระเงิน',
    contents: {
      type: 'bubble', size: 'micro',
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: '🔗 ดูบิล / ชำระเงิน', uri: portalUrl },
          style: 'primary', color: '#0C1B4D', height: 'sm',
        }],
      },
    },
  }
}

function paymentConfirmation(opts: {
  title: string
  roomNumber: string
  billingMonth: string
  status: string
  paidAmount: number
  remaining: number
  note?: string
}) {
  const lines = [
    `✅ ${opts.title}`,
    `ห้อง ${opts.roomNumber}`,
    `รอบบิล ${thaiMonth(opts.billingMonth)}`,
    `สถานะ: ${opts.status}`,
    `รับชำระแล้ว: ${fmt(opts.paidAmount)} บาท`,
    `ยอดคงเหลือ: ${fmt(opts.remaining)} บาท`,
  ]
  if (opts.note) lines.push(opts.note)
  return lines.join('\n')
}

async function getImageBlob(messageId: string, token: string) {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const blob = await res.blob()
  return { blob, contentType: blob.type || 'image/jpeg' }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

// ── SlipOK verification ──────────────────────────────────────
async function verifySlipOk(
  imageBlob: Blob,
  contentType: string,
  branchId: string,
  apiKey: string
): Promise<SlipOkResponse> {
  const fd = new FormData()
  fd.append('files', new File([imageBlob], 'slip.jpg', { type: contentType }))
  fd.append('log', 'true')

  const res = await fetch(
    `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`,
    { method: 'POST', headers: { 'x-authorization': apiKey }, body: fd }
  )

  try {
    return await res.json() as SlipOkResponse
  } catch {
    return { success: false, message: `HTTP ${res.status}` }
  }
}

// ── Event handlers ───────────────────────────────────────────
async function handleFollow(replyToken: string, cfg: LineConfig) {
  await reply(replyToken, cfg.channelAccessToken, [{
    type: 'text',
    text: 'ยินดีต้อนรับ 🏠\n\nกรุณาสแกน QR จากห้องเช่าของท่านเพื่อจับคู่บัญชี LINE กับห้องพัก\n\nเมื่อจับคู่แล้ว ท่านจะได้รับใบแจ้งค่าเช่าและแจ้งเตือนต่างๆ ทาง LINE นี้',
  }])
}

async function handleText(lineUserId: string, text: string, replyToken: string, cfg: LineConfig, supabase: SupabaseClient) {
  const upper = text.trim().toUpperCase()

  // ตรวจว่าเป็น pairing code (6 ตัวอักษร A-Z0-9)
  if (/^[A-Z0-9]{6}$/.test(upper)) {
    const now = new Date().toISOString()
    const { data: tokenRow } = await supabase
      .from('pairing_tokens')
      .select('id, tenant_id')
      .eq('token', upper)
      .is('used_at', null)
      .is('cancelled_at', null)
      .gt('expires_at', now)
      .maybeSingle()

    if (tokenRow) {
      const { error } = await supabase
        .from('tenants')
        .update({ line_user_id: lineUserId })
        .eq('id', tokenRow.tenant_id)

      if (!error) {
        const displayName = await getDisplayName(lineUserId, cfg.channelAccessToken)
        await supabase
          .from('pairing_tokens')
          .update({ used_at: now, line_user_id: lineUserId, display_name: displayName })
          .eq('id', tokenRow.id)

        // ดึงข้อมูลผู้เช่าและห้อง
        const { data: tenantInfo } = await supabase
          .from('tenants')
          .select('full_name, contracts(rooms(room_number))')
          .eq('id', tokenRow.tenant_id)
          .eq('contracts.status', 'active')
          .maybeSingle()

        type ContractJoin = { rooms: { room_number: string } | null }
        const contracts = tenantInfo?.contracts as unknown as ContractJoin[] | null
        const roomNumber = contracts?.[0]?.rooms?.room_number ?? '—'

        await reply(replyToken, cfg.channelAccessToken, [{
          type: 'text',
          text: `✅ จับคู่สำเร็จแล้วครับ!\n\n🏠 ห้อง ${roomNumber}\n👤 ${tenantInfo?.full_name ?? ''}\n\nตอนนี้คุณจะได้รับใบแจ้งค่าเช่าและแจ้งเตือนต่างๆ ทาง LINE นี้ครับ 😊`,
        }])
        return
      }
    }

    // code ไม่ถูกต้องหรือหมดอายุ
    await reply(replyToken, cfg.channelAccessToken, [{
      type: 'text',
      text: 'รหัสไม่ถูกต้องหรือหมดอายุแล้วครับ\nกรุณาสแกน QR อีกครั้งเพื่อรับรหัสใหม่ครับ',
    }])
    return
  }

  // ข้อความทั่วไป — ตรวจสถานะการจับคู่
  const { data: existing } = await supabase
    .from('tenants')
    .select('full_name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  await reply(replyToken, cfg.channelAccessToken, [{
    type: 'text',
    text: existing
      ? `บัญชีของคุณ (${existing.full_name}) จับคู่กับห้องแล้ว\nส่งรูปสลิปเพื่อแจ้งชำระค่าเช่าได้เลยครับ 😊`
      : 'กรุณาสแกน QR จากห้องเช่าของท่านเพื่อจับคู่บัญชี LINE\n\nหากมีปัญหา กรุณาติดต่อเจ้าของหอครับ',
  }])
}

async function handleSlipImage(
  lineUserId: string,
  messageId: string,
  replyToken: string,
  cfg: LineConfig,
  supabase: SupabaseClient
) {
  const token = cfg.channelAccessToken

  // Get tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, full_name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  if (!tenant) {
    await reply(replyToken, token, [{
      type: 'text',
      text: 'ยังไม่ได้จับคู่บัญชีครับ\nกรุณาสแกน QR จากห้องเช่าของท่านก่อนนะครับ',
    }])
    return
  }

  const { data: activeContract } = await supabase
    .from('contracts')
    .select('rooms(room_number)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')
    .maybeSingle()

  type RJ = { room_number: string }
  const room = activeContract?.rooms as unknown as RJ | null
  const roomNumber = room?.room_number ?? '—'

  // Handle room 99 test
  if (roomNumber === '99') {
    await reply(replyToken, token, [{ type: 'text', text: '🧪 ห้องทดสอบ 99 — ระบบรับสลิปแล้วครับ' }])
    await notifyOwner(cfg, `🧪 [TEST ห้อง 99] ได้รับสลิปจาก ${tenant.full_name}`)
    return
  }

  // Get SlipOK settings
  const { data: settings } = await supabase
    .from('settings')
    .select('slipok_api_key, slipok_branch_id')
    .eq('id', 1)
    .maybeSingle()

  if (!settings?.slipok_api_key || !settings?.slipok_branch_id) {
    await reply(replyToken, token, [{ type: 'text', text: 'ได้รับรูปแล้วครับ 😊\nเจ้าของหอจะตรวจสอบให้นะครับ' }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ยังไม่ได้ตั้งค่า SlipOK`)
    return
  }

  // Download image
  const image = await getImageBlob(messageId, token)
  if (!image) {
    await reply(replyToken, token, [{ type: 'text', text: 'ได้รับรูปแล้วครับ แต่ระบบตรวจสลิปอัตโนมัติไม่สำเร็จ กรุณารอเจ้าของตรวจสอบ หรือส่งสลิปที่ชัดเจนอีกครั้งครับ' }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ตรวจไม่ได้\nสาเหตุ: ดาวน์โหลดรูปไม่สำเร็จ`)
    return
  }

  // Verify with SlipOK
  let slipResult: SlipOkResponse
  try {
    slipResult = await verifySlipOk(image.blob, image.contentType, settings.slipok_branch_id, settings.slipok_api_key)
  } catch (error) {
    await reply(replyToken, token, [{ type: 'text', text: 'ได้รับรูปแล้วครับ แต่ระบบตรวจสลิปอัตโนมัติไม่สำเร็จ กรุณารอเจ้าของตรวจสอบ หรือส่งสลิปที่ชัดเจนอีกครั้งครับ' }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ตรวจไม่ได้\nสาเหตุ: ${String(error)}`)
    return
  }

  // SlipOK failed
  if (!slipResult.success || !slipResult.data) {
    const reason = slipResult.message
      ? `${slipResult.message}${slipResult.code ? ` (${slipResult.code})` : ''}`
      : 'SlipOK ตรวจไม่ผ่าน'

    // Check if it's a duplicate
    if (slipResult.code === 1012 || slipResult.message?.toLowerCase().includes('duplicate')) {
      await reply(replyToken, token, [{
        type: 'text',
        text: `⚠️ สลิปนี้เคยถูกตรวจแล้วครับ\nกรุณาติดต่อเจ้าของหอนะครับ`,
      }])
      await notifyOwner(cfg, `⚠️ SlipOK แจ้งว่าสลิปนี้ซ้ำครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\nสาเหตุ: ${reason}`)
      return
    }

    await reply(replyToken, token, [{
      type: 'text',
      text: `ได้รับรูปแล้วครับ แต่ระบบตรวจสลิปอัตโนมัติไม่สำเร็จ กรุณารอเจ้าของตรวจสอบ หรือส่งสลิปที่ชัดเจนอีกครั้งครับ`,
    }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ตรวจไม่ได้\nสาเหตุ: ${reason}`)
    return
  }

  const { amount, transDate, transTime, ref, sender } = slipResult.data
  const senderName = sender?.name ?? ''
  const slipRef = ref ?? null

  // Check duplicate ref in DB
  if (slipRef) {
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id, bill_id, bills(rooms(room_number))')
      .eq('slip_ref', slipRef)
      .maybeSingle()

    if (existingPayment) {
      type BillJoin = { rooms: { room_number: string } | null }
      const usedBill = existingPayment.bills as unknown as BillJoin | null
      const usedRoom = usedBill?.rooms?.room_number ?? '—'
      await reply(replyToken, token, [{
        type: 'text',
        text: `⚠️ สลิปนี้เคยถูกใช้แล้วครับ\n🏠 ใช้กับห้อง: ${usedRoom}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef}\nกรุณาติดต่อเจ้าของหอนะครับ`,
      }])
      await notifyOwner(cfg, `⚠️ พบสลิปซ้ำครับ\n🏠 ผู้ส่งปัจจุบัน: ห้อง ${roomNumber} — ${tenant.full_name}\nเคยใช้ที่ห้อง: ${usedRoom}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef}`)
      return
    }
  }

  // Format slip date/time
  let paidDate: Date | null = null
  try {
    const [dd, mm, yyyy] = transDate.split('/')
    const year = Number(yyyy) > 2500 ? Number(yyyy) - 543 : Number(yyyy)
    paidDate = new Date(`${year}-${mm}-${dd}T${transTime}`)
  } catch { /* use now */ }

  const thDate = paidDate ? thaiDate(paidDate) : transDate
  const paidAt = paidDate?.toISOString() ?? new Date().toISOString()

  // Upload slip image
  const arrayBuffer = await image.blob.arrayBuffer()
  const ext = image.contentType.split('/')[1] || 'jpg'
  const uploadPath = `line/${tenant.id}/${Date.now()}.${ext}`
  const { data: upload } = await supabase.storage
    .from('payment-slips')
    .upload(uploadPath, arrayBuffer, { contentType: image.contentType, upsert: false })

  const slipUrl = upload
    ? supabase.storage.from('payment-slips').getPublicUrl(upload.path).data.publicUrl
    : null

  // Find matching bill
  const { data: bills } = await supabase
    .from('bills')
    .select('id, total_amount, billing_month, status')
    .eq('tenant_id', tenant.id)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: false })
    .limit(5)

  const matchingBill = bills?.find((b) => Math.abs(Number(b.total_amount) - amount) < 1)

  if (!matchingBill) {
    await reply(replyToken, token, [{
      type: 'text',
      text: `ได้รับรูปแล้วครับ แต่ระบบตรวจสลิปอัตโนมัติไม่สำเร็จ กรุณารอเจ้าของตรวจสอบ หรือส่งสลิปที่ชัดเจนอีกครั้งครับ`,
    }])
    await notifyOwner(cfg, `🧾 ตรวจสลิปสำเร็จครับ แต่ไม่พบบิลที่ตรงกัน\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n💰 ${fmt(amount)} บาท\n📅 ${thDate} ${transTime}\n${senderName ? `ผู้โอน: ${senderName}` : ''}\n🔢 Ref: ${slipRef ?? '-'}`)
    return
  }

  // Record payment
  const { error: payErr } = await supabase.from('payments').insert({
    bill_id: matchingBill.id,
    amount,
    payment_method: 'transfer',
    slip_url: slipUrl,
    slip_ref: slipRef,
    note: `สลิปจาก LINE${senderName ? ` (${senderName})` : ''}`,
    paid_at: paidAt,
  })

  if (payErr) {
    await reply(replyToken, token, [{ type: 'text', text: 'ได้รับรูปแล้วครับ แต่ระบบตรวจสลิปอัตโนมัติไม่สำเร็จ กรุณารอเจ้าของตรวจสอบ หรือส่งสลิปที่ชัดเจนอีกครั้งครับ' }])
    await notifyOwner(cfg, `⚠️ Worker error: บันทึก payment ไม่สำเร็จ\n🏠 ห้อง ${roomNumber}\nError: ${payErr.message}`)
    return
  }

  // Check total paid
  const { data: allPayments } = await supabase
    .from('payments')
    .select('amount')
    .eq('bill_id', matchingBill.id)

  const totalPaid = (allPayments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const totalBill = Number(matchingBill.total_amount)
  const remaining = Math.max(0, totalBill - totalPaid)
  const fullyPaid = remaining < 1

  if (fullyPaid) {
    await supabase.from('bills').update({ status: 'paid' }).eq('id', matchingBill.id)
  }

  const status = fullyPaid ? 'ชำระแล้ว ✅' : 'รับชำระบางส่วน'
  const confirmText = paymentConfirmation({
    title: fullyPaid ? 'ชำระเงินครบแล้วครับ!' : 'รับชำระบางส่วนแล้วครับ',
    roomNumber,
    billingMonth: matchingBill.billing_month as string,
    status,
    paidAmount: totalPaid,
    remaining,
    note: slipRef ? `🔢 Ref: ${slipRef}` : undefined,
  })

  const portalUrl = buildBillPortalUrl(matchingBill.id, cfg.liffId, cfg.appUrl)

  await reply(replyToken, token, [
    { type: 'text', text: confirmText },
    buildPortalFlex(portalUrl),
  ])

  if (fullyPaid) {
    await notifyOwner(cfg, `✅ สลิปถูกต้อง! อัปเดตสถานะแล้วครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef ?? '-'}\n📅 ${thDate} ${transTime}`)
  } else {
    await notifyOwner(cfg, `⚠️ รับชำระบางส่วนครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n💰 ยอดค้างเหลือ: ${fmt(remaining)} บาท\n🔢 Ref: ${slipRef ?? '-'}`)
  }
}

// ── Route handlers ───────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'LINE webhook' })
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  let cfg: LineConfig | null = null
  try { cfg = await getLineConfig() } catch { return NextResponse.json({ ok: true }) }
  if (!cfg) return NextResponse.json({ ok: true })

  if (cfg.channelSecret) {
    const valid = await isValidSignature(bodyText, signature, cfg.channelSecret)
    if (!valid) return NextResponse.json({ ok: true })
  }

  let payload: { events: LineEvent[] }
  try { payload = JSON.parse(bodyText) as { events: LineEvent[] } }
  catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const supabase = createServiceClient()

  for (const event of payload.events ?? []) {
    try {
      const lineUserId = event.source.userId

      if (event.type === 'follow' && event.replyToken) {
        await handleFollow(event.replyToken, cfg)
        continue
      }

      if (event.type !== 'message' || !event.message || !event.replyToken) continue

      if (event.message.type === 'image') {
        await handleSlipImage(lineUserId, event.message.id, event.replyToken, cfg, supabase)
        continue
      }

      if (event.message.type === 'text') {
        await handleText(lineUserId, event.message.text ?? '', event.replyToken, cfg, supabase)
      }
    } catch (error) {
      console.error('[webhook]', error)
      await notifyOwner(cfg, `⚠️ Worker error: ${String(error)}`)
    }
  }

  return NextResponse.json({ ok: true })
}
