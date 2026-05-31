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

// Module-level cache — Worker instance ถูกเก็บไว้ระหว่าง requests (warm)
// config เปลี่ยนแค่เมื่อ admin แก้ settings ดังนั้น cache 5 นาทีปลอดภัย
let _lineConfigCache: { config: LineConfig | null; expiresAt: number } | null = null

async function getLineConfig(): Promise<LineConfig | null> {
  const now = Date.now()
  if (_lineConfigCache && now < _lineConfigCache.expiresAt) return _lineConfigCache.config

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('line_integrations')
    .select('encrypted_channel_access_token, encrypted_channel_secret, line_liff_id, app_url, owner_line_user_id')
    .eq('dorm_id', DEFAULT_DORM_ID)
    .maybeSingle()

  if (!data?.encrypted_channel_access_token) {
    _lineConfigCache = { config: null, expiresAt: now + 60_000 }
    return null
  }

  const config: LineConfig = {
    channelAccessToken: await decryptSecret(data.encrypted_channel_access_token),
    channelSecret: data.encrypted_channel_secret ? await decryptSecret(data.encrypted_channel_secret) : null,
    liffId: data.line_liff_id ?? null,
    appUrl: data.app_url ?? null,
    ownerLineUserId: data.owner_line_user_id ?? null,
  }
  _lineConfigCache = { config, expiresAt: now + 300_000 } // 5 นาที
  return config
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

function buildPaymentFlex(opts: {
  fullyPaid: boolean
  roomNumber: string
  billingMonth: string
  paidAmount: number
  remaining: number
  ref?: string | null
  portalUrl: string
}) {
  const headerBg  = opts.fullyPaid ? '#16a34a' : '#d97706'
  const headerText = opts.fullyPaid ? '✅  ชำระค่าเช่าครบแล้วครับ!' : '💳  รับชำระบางส่วนแล้วครับ'
  const altText    = opts.fullyPaid ? 'ชำระค่าเช่าครบแล้ว' : 'รับชำระบางส่วน'

  const row = (label: string, value: string, valueColor = '#111827') => ({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: label, color: '#6b7280', size: 'sm', flex: 4 },
      { type: 'text', text: value, color: valueColor, size: 'sm', weight: 'bold', flex: 5, align: 'end' as const },
    ],
  })

  const bodyContents: object[] = [
    row('🏠  ห้อง', opts.roomNumber),
    row('📅  รอบบิล', thaiMonth(opts.billingMonth)),
    { type: 'separator', margin: 'md' },
    row('💰  ชำระแล้ว', `${fmt(opts.paidAmount)} บาท`, '#16a34a'),
    opts.fullyPaid
      ? row('🟢  คงเหลือ', '0 บาท')
      : row('⏳  ยังค้างชำระ', `${fmt(opts.remaining)} บาท`, '#d97706'),
  ]
  if (opts.ref) bodyContents.push(row('🔢  Ref', opts.ref, '#6b7280'))
  if (!opts.fullyPaid) bodyContents.push({
    type: 'text', text: 'กรุณาชำระส่วนที่เหลือด้วยนะครับ 🙏',
    size: 'xs', color: '#d97706', margin: 'md', wrap: true,
  })

  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: headerBg, paddingAll: '16px',
        contents: [{ type: 'text', text: headerText, color: '#ffffff', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: bodyContents,
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button',
          action: { type: 'uri', label: '🔗  ดูบิล / ชำระเงิน', uri: opts.portalUrl },
          style: 'primary', color: '#0C1B4D', height: 'sm',
        }],
      },
    },
  }
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
    text: [
      '🏠 ยินดีต้อนรับสู่ระบบหอพัก!',
      '',
      'กรุณาสแกน QR Code จากห้องเช่าของท่าน',
      'เพื่อเชื่อมบัญชี LINE กับห้องพักของคุณ',
      '',
      'เมื่อเชื่อมแล้วจะได้รับ:',
      '📄 ใบแจ้งค่าเช่าทุกเดือน',
      '🔔 แจ้งเตือนยอดค้างชำระ',
      '✅ ยืนยันการรับชำระเงินทันที',
    ].join('\n'),
  }])
}

const BILL_KEYWORDS = ['บิล', 'ค่าเช่า', 'ยอด', 'เงิน', 'ค้าง', 'ชำระ', 'จ่าย', 'โอน', 'สลิป', 'ค่าน้ำ', 'ค่าไฟ']

function matchesBillKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  return BILL_KEYWORDS.some((kw) => lower.includes(kw))
}

async function handleText(lineUserId: string, text: string, replyToken: string, cfg: LineConfig, supabase: SupabaseClient) {
  if (!matchesBillKeyword(text)) return

  const { data: existing } = await supabase
    .from('tenants')
    .select('full_name')
    .eq('line_user_id', lineUserId)
    .maybeSingle()

  await reply(replyToken, cfg.channelAccessToken, [{
    type: 'text',
    text: existing
      ? [
          `✅ บัญชีของคุณ (${existing.full_name}) เชื่อมกับห้องแล้วครับ`,
          '',
          '📎 ส่งรูปสลิปโอนเงิน เพื่อแจ้งชำระค่าเช่าได้เลยครับ 😊',
        ].join('\n')
      : [
          '⚠️ ยังไม่ได้เชื่อมบัญชี LINE กับห้องพักครับ',
          '',
          'กรุณาสแกน QR Code จากห้องเช่าของท่าน',
          'เพื่อเริ่มใช้งานระบบ',
          '',
          'หากมีปัญหา กรุณาติดต่อเจ้าของหอครับ',
        ].join('\n'),
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

  // ดึง tenant + settings พร้อมกัน
  const [{ data: tenant }, { data: settings }] = await Promise.all([
    supabase.from('tenants').select('id, full_name').eq('line_user_id', lineUserId).maybeSingle(),
    supabase.from('settings').select('slipok_api_key, slipok_branch_id').eq('id', 1).maybeSingle(),
  ])

  if (!tenant) {
    await reply(replyToken, token, [{
      type: 'text',
      text: [
        '⚠️ ยังไม่ได้เชื่อมบัญชี LINE กับห้องพักครับ',
        '',
        'กรุณาสแกน QR Code จากห้องเช่าของท่านก่อนนะครับ',
        'หากมีปัญหา กรุณาติดต่อเจ้าของหอครับ',
      ].join('\n'),
    }])
    return
  }

  // ดึงทุกห้องที่ผู้เช่ากำลังเช่าอยู่ (รองรับผู้เช่าหลายห้อง)
  const { data: activeContracts } = await supabase
    .from('contracts')
    .select('rooms(room_number)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'active')

  type RJ = { room_number: string }
  const activeRooms = (activeContracts ?? [])
    .map((c) => (c.rooms as unknown as RJ | null)?.room_number)
    .filter((n): n is string => Boolean(n))
  let roomNumber = activeRooms.length > 0 ? activeRooms.join(', ') : '—'

  // Handle room 99 test
  if (activeRooms.includes('99')) {
    await reply(replyToken, token, [{ type: 'text', text: '🧪 ห้องทดสอบ 99 — ระบบรับสลิปแล้วครับ' }])
    await notifyOwner(cfg, `🧪 [TEST ห้อง 99] ได้รับสลิปจาก ${tenant.full_name}`)
    return
  }

  if (!settings?.slipok_api_key || !settings?.slipok_branch_id) {
    await reply(replyToken, token, [{
      type: 'text',
      text: [
        '📨 ได้รับสลิปแล้วครับ',
        '',
        'เจ้าของหอจะตรวจสอบและยืนยันให้นะครับ 😊',
      ].join('\n'),
    }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ยังไม่ได้ตั้งค่า SlipOK`)
    return
  }

  // Download image
  const image = await getImageBlob(messageId, token)
  if (!image) {
    await reply(replyToken, token, [{ type: 'text', text: '📨 ได้รับรูปสลิปแล้วครับ\n\n⚠️ ระบบตรวจสอบอัตโนมัติไม่สำเร็จ\nกรุณารอเจ้าของหอตรวจสอบ หรือส่งรูปสลิปที่ชัดเจนอีกครั้งครับ' }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ตรวจไม่ได้\nสาเหตุ: ดาวน์โหลดรูปไม่สำเร็จ`)
    return
  }

  // Verify with SlipOK
  let slipResult: SlipOkResponse
  try {
    slipResult = await verifySlipOk(image.blob, image.contentType, settings.slipok_branch_id, settings.slipok_api_key)
  } catch (error) {
    await reply(replyToken, token, [{ type: 'text', text: '📨 ได้รับรูปสลิปแล้วครับ\n\n⚠️ ระบบตรวจสอบอัตโนมัติไม่สำเร็จ\nกรุณารอเจ้าของหอตรวจสอบ หรือส่งรูปสลิปที่ชัดเจนอีกครั้งครับ' }])
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
        text: [
          '⚠️ สลิปนี้เคยถูกตรวจสอบแล้วครับ',
          '',
          'หากมีข้อสงสัย กรุณาติดต่อเจ้าของหอนะครับ',
        ].join('\n'),
      }])
      await notifyOwner(cfg, `⚠️ SlipOK แจ้งว่าสลิปนี้ซ้ำครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\nสาเหตุ: ${reason}`)
      return
    }

    await reply(replyToken, token, [{
      type: 'text',
      text: `📨 ได้รับรูปสลิปแล้วครับ\n\n⚠️ ระบบตรวจสอบอัตโนมัติไม่สำเร็จ\nกรุณารอเจ้าของหอตรวจสอบ หรือส่งรูปสลิปที่ชัดเจนอีกครั้งครับ`,
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
        text: [
          '⚠️ สลิปนี้เคยถูกใช้งานแล้วครับ',
          SEP,
          `🏠 ห้อง: ${usedRoom}`,
          `💰 จำนวน: ${fmt(amount)} บาท`,
          `🔢 Ref: ${slipRef}`,
          SEP,
          'กรุณาติดต่อเจ้าของหอนะครับ',
        ].join('\n'),
      }])
      await notifyOwner(cfg, `⚠️ พบสลิปซ้ำครับ\n🏠 ผู้ส่งปัจจุบัน: ห้อง ${roomNumber} — ${tenant.full_name}\nเคยใช้ที่ห้อง: ${usedRoom}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef}`)
      return
    }
  }

  // Format slip date/time
  let paidDate: Date | null = null
  try {
    if (transDate && transTime) {
      if (transDate.includes('/')) {
        // DD/MM/YYYY (SlipOK standard, may use Buddhist year)
        const parts = transDate.split('/')
        if (parts.length === 3) {
          const [dd, mm, yyyy] = parts
          const year = Number(yyyy) > 2500 ? Number(yyyy) - 543 : Number(yyyy)
          const candidate = new Date(`${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${transTime}`)
          if (!isNaN(candidate.getTime())) paidDate = candidate
        }
      } else {
        // ISO or other format — try direct parse
        const candidate = new Date(`${transDate}T${transTime}`)
        if (!isNaN(candidate.getTime())) paidDate = candidate
        else {
          const candidate2 = new Date(transDate)
          if (!isNaN(candidate2.getTime())) paidDate = candidate2
        }
      }
    }
  } catch { /* fallback to now */ }

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

  // Find matching bill (ทุกห้องของผู้เช่า — จับคู่ด้วยยอดเงิน)
  const { data: bills } = await supabase
    .from('bills')
    .select('id, total_amount, billing_month, status, rooms(room_number)')
    .eq('tenant_id', tenant.id)
    .in('status', ['pending', 'overdue'])
    .order('billing_month', { ascending: false })
    .limit(10)

  const matchingBill = bills?.find((b) => Math.abs(Number(b.total_amount) - amount) < 1)

  // เมื่อ match บิลได้ ใช้ห้องของบิลนั้นเป็นห้องที่แสดง (แม่นยำกว่าการรวมทุกห้อง)
  if (matchingBill) {
    const matchedRoom = matchingBill.rooms as unknown as RJ | null
    if (matchedRoom?.room_number) roomNumber = matchedRoom.room_number
  }

  if (!matchingBill) {
    await reply(replyToken, token, [{
      type: 'text',
      text: `📨 ได้รับรูปสลิปแล้วครับ\n\n⚠️ ระบบตรวจสอบอัตโนมัติไม่สำเร็จ\nกรุณารอเจ้าของหอตรวจสอบ หรือส่งรูปสลิปที่ชัดเจนอีกครั้งครับ`,
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
    await reply(replyToken, token, [{ type: 'text', text: '📨 ได้รับรูปสลิปแล้วครับ\n\n⚠️ ระบบตรวจสอบอัตโนมัติไม่สำเร็จ\nกรุณารอเจ้าของหอตรวจสอบ หรือส่งรูปสลิปที่ชัดเจนอีกครั้งครับ' }])
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

  const portalUrl = buildBillPortalUrl(matchingBill.id, cfg.liffId, cfg.appUrl)

  await reply(replyToken, token, [
    buildPaymentFlex({
      fullyPaid,
      roomNumber,
      billingMonth: matchingBill.billing_month as string,
      paidAmount: totalPaid,
      remaining,
      ref: slipRef,
      portalUrl,
    }),
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
      // ตอบผู้ใช้เสมอแม้เกิดข้อผิดพลาด เพื่อไม่ให้เงียบหาย (best-effort)
      if (event.type === 'message' && event.replyToken) {
        try {
          await reply(event.replyToken, cfg.channelAccessToken, [{
            type: 'text',
            text: 'ขออภัยครับ ระบบขัดข้องชั่วคราว กรุณาส่งใหม่อีกครั้ง หรือติดต่อเจ้าของหอครับ',
          }])
        } catch { /* reply token อาจถูกใช้ไปแล้ว */ }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
