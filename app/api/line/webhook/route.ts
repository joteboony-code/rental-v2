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

function billSortKey(bill: { due_date?: string | null; billing_month: string }) {
  return bill.due_date ?? bill.billing_month
}

function isPastDue(dueDate?: string | null) {
  if (!dueDate) return false
  return dueDate < new Date().toISOString().slice(0, 10)
}

// ── savePendingSlip ──────────────────────────────────────────────────────────
async function savePendingSlip(
  supabase: SupabaseClient,
  data: {
    tenantId: string
    lineUserId: string
    slipUrl: string | null
    amount: number | null
    paidAt: string | null
    slipRef: string | null
    senderName: string | null
    slipokStatus: string
    slipokCode?: number | null
    slipokMessage?: string | null
    matchCandidates?: unknown
  }
): Promise<void> {
  try {
    await supabase.from('pending_slips').insert({
      tenant_id:       data.tenantId,
      line_user_id:    data.lineUserId,
      source:          'line',
      slip_url:        data.slipUrl,
      amount:          data.amount,
      paid_at:         data.paidAt,
      slip_ref:        data.slipRef,
      sender_name:     data.senderName,
      slipok_status:   data.slipokStatus,
      slipok_code:     data.slipokCode ?? null,
      slipok_message:  data.slipokMessage ?? null,
      match_candidates: data.matchCandidates ?? null,
    })
  } catch { /* don't block webhook on save failure */ }
}

const RECEIVED_REPLY = '📨 ได้รับสลิปแล้วครับ\n\nเจ้าของหอจะตรวจสอบและยืนยันให้นะครับ 😊'

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

function buildMultiBillPaymentFlex(opts: {
  tenantName: string
  paidBills: { roomNumber: string; billingMonth: string; amount: number }[]
  totalPaid: number
  ref?: string | null
  portalUrl: string
}): object {
  const row = (label: string, value: string, valueColor = '#111827') => ({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: label, color: '#6b7280', size: 'sm', flex: 4 },
      { type: 'text', text: value, color: valueColor, size: 'sm', weight: 'bold', flex: 5, align: 'end' as const },
    ],
  })

  const billRows: object[] = opts.paidBills.map((b) => ({
    type: 'box', layout: 'horizontal', margin: 'sm',
    contents: [
      { type: 'text', text: `🏠 ห้อง ${b.roomNumber}`, color: '#374151', size: 'sm', flex: 3 },
      { type: 'text', text: thaiMonth(b.billingMonth), color: '#6b7280', size: 'sm', flex: 5 },
      { type: 'text', text: `฿${fmt(b.amount)}`, color: '#16a34a', size: 'sm', weight: 'bold', flex: 3, align: 'end' as const },
    ],
  }))

  const bodyContents: object[] = [
    ...billRows,
    { type: 'separator', margin: 'md' },
    row('💰  รวมชำระ', `${fmt(opts.totalPaid)} บาท`, '#16a34a'),
    row('🟢  คงเหลือ', '0 บาท'),
    ...(opts.ref ? [row('🔢  Ref', opts.ref, '#6b7280')] : []),
  ]

  return {
    type: 'flex',
    altText: `✅ ชำระค่าเช่าครบแล้ว ${opts.paidBills.length} ห้อง`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#16a34a', paddingAll: '16px',
        contents: [{ type: 'text', text: '✅  ชำระค่าเช่าครบแล้วครับ!', color: '#ffffff', weight: 'bold', size: 'md' }],
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

async function handleSlipImage(
  lineUserId: string,
  messageId: string,
  replyToken: string,
  cfg: LineConfig,
  supabase: SupabaseClient
) {
  const token = cfg.channelAccessToken

  // Fetch ALL tenants linked to this line_user_id (multi-room support) + settings in parallel
  const [{ data: tenantsData }, { data: settings }] = await Promise.all([
    supabase.from('tenants').select('id, full_name').eq('line_user_id', lineUserId),
    supabase.from('settings').select('slipok_api_key, slipok_branch_id').eq('id', 1).maybeSingle(),
  ])

  const allTenantIds = (tenantsData ?? []).map((t) => t.id as string)
  const tenant = tenantsData?.[0] ?? null

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

  // ดึงทุกห้องที่ผู้เช่ากำลังเช่าอยู่ (รองรับผู้เช่าหลายห้องหลาย tenant_id)
  const { data: activeContracts } = await supabase
    .from('contracts')
    .select('rooms(room_number)')
    .in('tenant_id', allTenantIds)
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

  // Download image first (ก่อนตรวจ SlipOK เพื่อให้เก็บรูปไว้ได้เสมอ)
  const image = await getImageBlob(messageId, token)
  if (!image) {
    await reply(replyToken, token, [{ type: 'text', text: RECEIVED_REPLY }])
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ดาวน์โหลดรูปไม่สำเร็จ`)
    await savePendingSlip(supabase, { tenantId: tenant.id, lineUserId, slipUrl: null, amount: null, paidAt: null, slipRef: null, senderName: null, slipokStatus: 'download_error' })
    return
  }

  // Upload image to storage immediately so we always have a copy
  const arrayBuffer = await image.blob.arrayBuffer()
  const ext = image.contentType.split('/')[1] || 'jpg'
  const uploadPath = `line/${tenant.id}/${Date.now()}.${ext}`
  const { data: upload } = await supabase.storage
    .from('payment-slips')
    .upload(uploadPath, arrayBuffer, { contentType: image.contentType, upsert: false })
  const slipUrl = upload
    ? supabase.storage.from('payment-slips').getPublicUrl(upload.path).data.publicUrl
    : null

  if (!settings?.slipok_api_key || !settings?.slipok_branch_id) {
    await reply(replyToken, token, [{ type: 'text', text: RECEIVED_REPLY }])
    const reviewLink = cfg.appUrl ? `${cfg.appUrl}/payment-reviews` : ''
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ยังไม่ได้ตั้งค่า SlipOK${reviewLink ? `\n🔗 ${reviewLink}` : ''}`)
    await savePendingSlip(supabase, { tenantId: tenant.id, lineUserId, slipUrl, amount: null, paidAt: null, slipRef: null, senderName: null, slipokStatus: 'not_configured' })
    return
  }

  // Verify with SlipOK
  let slipResult: SlipOkResponse
  try {
    slipResult = await verifySlipOk(image.blob, image.contentType, settings.slipok_branch_id, settings.slipok_api_key)
  } catch (error) {
    await reply(replyToken, token, [{ type: 'text', text: RECEIVED_REPLY }])
    const reviewLink = cfg.appUrl ? `${cfg.appUrl}/payment-reviews` : ''
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ ติดต่อ SlipOK ไม่ได้\nสาเหตุ: ${String(error)}${reviewLink ? `\n🔗 ${reviewLink}` : ''}`)
    await savePendingSlip(supabase, { tenantId: tenant.id, lineUserId, slipUrl, amount: null, paidAt: null, slipRef: null, senderName: null, slipokStatus: 'failed', slipokMessage: String(error) })
    return
  }

  // SlipOK failed
  if (!slipResult.success || !slipResult.data) {
    const reason = slipResult.message
      ? `${slipResult.message}${slipResult.code ? ` (${slipResult.code})` : ''}`
      : 'SlipOK ตรวจไม่ผ่าน'

    // Not a slip at all (no QR code) — stay completely silent
    const isNotASlip =
      slipResult.code === 1015 ||
      Boolean(slipResult.message && /ไม่มี\s*QR|no\s*QR|QR\s*Code\s*not\s*found|รูปภาพไม่มี\s*QR/i.test(slipResult.message))
    if (isNotASlip) return

    // Duplicate — don't save to pending_slips (not actionable)
    if (slipResult.code === 1012 || slipResult.message?.toLowerCase().includes('duplicate')) {
      await reply(replyToken, token, [{
        type: 'text',
        text: ['⚠️ สลิปนี้เคยถูกตรวจสอบแล้วครับ', '', 'หากมีข้อสงสัย กรุณาติดต่อเจ้าของหอนะครับ'].join('\n'),
      }])
      await notifyOwner(cfg, `⚠️ SlipOK แจ้งว่าสลิปนี้ซ้ำครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\nสาเหตุ: ${reason}`)
      return
    }

    await reply(replyToken, token, [{ type: 'text', text: RECEIVED_REPLY }])
    const reviewLink = cfg.appUrl ? `${cfg.appUrl}/payment-reviews` : ''
    await notifyOwner(cfg, `🧾 มีสลิปเข้ามาครับ\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n⚠️ SlipOK ตรวจไม่ผ่าน\nสาเหตุ: ${reason}${reviewLink ? `\n🔗 ${reviewLink}` : ''}`)
    await savePendingSlip(supabase, { tenantId: tenant.id, lineUserId, slipUrl, amount: null, paidAt: null, slipRef: null, senderName: null, slipokStatus: 'failed', slipokCode: slipResult.code, slipokMessage: slipResult.message })
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

  // Fetch outstanding bills across ALL tenant_ids linked to this line_user_id, oldest first
  const { data: rawBills } = await supabase
    .from('bills')
    .select('id, tenant_id, total_amount, billing_month, due_date, status, rooms(room_number), payments(amount)')
    .in('tenant_id', allTenantIds)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .order('billing_month', { ascending: true })
    .limit(50)

  type PaymentJoin = { amount: number | string }
  type BillCandidate = {
    id: string
    tenant_id: string
    total_amount: number | string
    billing_month: string
    due_date: string | null
    status: string
    rooms: RJ | null
    payments: PaymentJoin[] | null
  }

  const outstandingBills = ((rawBills ?? []) as unknown as BillCandidate[])
    .map((bill) => {
      const paid = (bill.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      return { ...bill, paid, remainingAmount: Math.max(0, Number(bill.total_amount) - paid) }
    })
    .filter((b) => b.remainingAmount >= 1)
    .sort((a, b) => billSortKey(a).localeCompare(billSortKey(b)))

  const reviewLink = cfg.appUrl ? `\n🔗 ${cfg.appUrl}/payment-reviews` : ''
  const totalOutstanding = outstandingBills.reduce((s, b) => s + b.remainingAmount, 0)

  // Helper: insert payments for a list of bills (oldest first), split by remaining
  // Only the first bill gets slip_ref to preserve dedup integrity
  type PaidEntry = { roomNumber: string; billingMonth: string; amount: number }
  const payBills = async (
    billsToPay: typeof outstandingBills,
    note: string
  ): Promise<{ ok: boolean; paidBills: PaidEntry[] }> => {
    let remainder = amount
    const paidBills: PaidEntry[] = []
    let firstSlipRef = true
    for (const bill of billsToPay) {
      if (remainder < 1) break
      const toPay = Math.min(bill.remainingAmount, remainder)
      const { error } = await supabase.from('payments').insert({
        bill_id:        bill.id,
        amount:         toPay,
        payment_method: 'transfer',
        slip_url:       slipUrl,
        slip_ref:       firstSlipRef ? slipRef : null,
        note:           `สลิปจาก LINE${senderName ? ` (${senderName})` : ''}${note}`,
        paid_at:        paidAt,
      })
      if (error) return { ok: false, paidBills }
      firstSlipRef = false
      await supabase.from('bills').update({ status: 'paid' }).eq('id', bill.id)
      paidBills.push({
        roomNumber:   (bill.rooms as unknown as RJ | null)?.room_number ?? '?',
        billingMonth: bill.billing_month,
        amount:       toPay,
      })
      remainder -= toPay
    }
    return { ok: true, paidBills }
  }

  // ── Rule 1: unique single-bill exact match ─────────────────────────────────
  const singleMatches = outstandingBills.filter((b) => Math.abs(b.remainingAmount - amount) < 1)

  if (singleMatches.length === 1) {
    const bill    = singleMatches[0]
    const billRoom = (bill.rooms as unknown as RJ | null)?.room_number ?? '—'
    const { error: payErr } = await supabase.from('payments').insert({
      bill_id: bill.id, amount, payment_method: 'transfer',
      slip_url: slipUrl, slip_ref: slipRef,
      note: `สลิปจาก LINE${senderName ? ` (${senderName})` : ''}`,
      paid_at: paidAt,
    })
    if (payErr) {
      await reply(replyToken, token, [{ type: 'text', text: '⚠️ ระบบบันทึกการชำระไม่สำเร็จ กรุณาติดต่อเจ้าของหอครับ' }])
      await notifyOwner(cfg, `⚠️ Worker error: บันทึก payment ไม่สำเร็จ\n🏠 ห้อง ${billRoom}\nError: ${payErr.message}`)
      return
    }
    const { data: allPmts } = await supabase.from('payments').select('amount').eq('bill_id', bill.id)
    const totalPaid = (allPmts ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Math.max(0, Number(bill.total_amount) - totalPaid)
    const fullyPaid = remaining < 1
    const nextStatus = fullyPaid ? 'paid' : isPastDue(bill.due_date) ? 'overdue' : bill.status
    if (nextStatus !== bill.status) await supabase.from('bills').update({ status: nextStatus }).eq('id', bill.id)
    const portalUrl = buildBillPortalUrl(bill.id, cfg.liffId, cfg.appUrl)
    await reply(replyToken, token, [buildPaymentFlex({ fullyPaid, roomNumber: billRoom, billingMonth: bill.billing_month, paidAmount: totalPaid, remaining, ref: slipRef, portalUrl })])
    if (fullyPaid) {
      await notifyOwner(cfg, `✅ ชำระครบ! ห้อง ${billRoom} — ${tenant.full_name}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef ?? '-'}\n📅 ${thDate} ${transTime}`)
    } else {
      await notifyOwner(cfg, `⚠️ รับชำระบางส่วน ห้อง ${billRoom} — ${tenant.full_name}\n💰 ค้างเหลือ: ${fmt(remaining)} บาท\n🔢 Ref: ${slipRef ?? '-'}`)
    }
    return
  }

  // ── Rule 2: total of ALL outstanding bills for this line_user_id ───────────
  if (outstandingBills.length >= 1 && Math.abs(totalOutstanding - amount) < 1) {
    const { ok, paidBills } = await payBills(outstandingBills, ' (รวมยอดทุกห้อง)')
    if (ok) {
      const portalUrl = buildBillPortalUrl(outstandingBills[0].id, cfg.liffId, cfg.appUrl)
      await reply(replyToken, token, [buildMultiBillPaymentFlex({ tenantName: tenant.full_name, paidBills, totalPaid: amount, ref: slipRef, portalUrl })])
      const roomList = paidBills.map((b) => `ห้อง ${b.roomNumber}`).join(', ')
      await notifyOwner(cfg, `✅ ชำระรวมทุกห้อง! ${tenant.full_name}\n${roomList}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef ?? '-'}\n📅 ${thDate} ${transTime}`)
      return
    }
  }

  // ── Rule 3: unique room-total match (all outstanding of exactly one room) ──
  const byRoom = new Map<string, typeof outstandingBills>()
  for (const b of outstandingBills) {
    const rn = (b.rooms as unknown as RJ | null)?.room_number ?? '?'
    if (!byRoom.has(rn)) byRoom.set(rn, [])
    byRoom.get(rn)!.push(b)
  }
  const roomTotalMatches: { rn: string; bills: typeof outstandingBills }[] = []
  for (const [rn, roomBills] of byRoom) {
    const roomTotal = roomBills.reduce((s, b) => s + b.remainingAmount, 0)
    if (Math.abs(roomTotal - amount) < 1) roomTotalMatches.push({ rn, bills: roomBills })
  }

  if (roomTotalMatches.length === 1) {
    const { rn, bills: roomBills } = roomTotalMatches[0]
    const { ok, paidBills } = await payBills(roomBills, ` (รวมยอดห้อง ${rn})`)
    if (ok) {
      const portalUrl = buildBillPortalUrl(roomBills[0].id, cfg.liffId, cfg.appUrl)
      await reply(replyToken, token, [buildMultiBillPaymentFlex({ tenantName: tenant.full_name, paidBills, totalPaid: amount, ref: slipRef, portalUrl })])
      await notifyOwner(cfg, `✅ ชำระรวมห้อง ${rn}! ${tenant.full_name}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef ?? '-'}\n📅 ${thDate} ${transTime}`)
      return
    }
  }

  // ── Rule 4: ambiguous (amount matches multiple bills or multiple room-totals) ─
  const isAmbiguous = singleMatches.length > 1 || roomTotalMatches.length > 1
  if (isAmbiguous) {
    const candidates = (singleMatches.length > 1 ? singleMatches : roomTotalMatches.flatMap((m) => m.bills))
      .map((b) => ({ room: (b.rooms as unknown as RJ | null)?.room_number ?? '-', month: b.billing_month, remaining: b.remainingAmount }))
    await reply(replyToken, token, [{ type: 'text', text: RECEIVED_REPLY }])
    const candidateText = candidates.map((c) => `- ห้อง ${c.room} / ${thaiMonth(c.month)} / ค้าง ${fmt(c.remaining)} บาท`).join('\n')
    await notifyOwner(cfg, `🧾 ตรวจสลิปสำเร็จ แต่ยอดตรงกับหลายบิล\n🏠 ${tenant.full_name}\n💰 ${fmt(amount)} บาท\n🔢 Ref: ${slipRef ?? '-'}\n\n${candidateText}${reviewLink}`)
    await savePendingSlip(supabase, { tenantId: tenant.id, lineUserId, slipUrl, amount, paidAt, slipRef, senderName, slipokStatus: 'ambiguous', matchCandidates: candidates })
    return
  }

  // ── Rule 5: no match → pending_slips ──────────────────────────────────────
  await reply(replyToken, token, [{ type: 'text', text: RECEIVED_REPLY }])
  await notifyOwner(cfg, `🧾 ตรวจสลิปสำเร็จ แต่ไม่พบบิลที่ตรงยอด\n🏠 ห้อง ${roomNumber} — ${tenant.full_name}\n💰 ${fmt(amount)} บาท\n📅 ${thDate} ${transTime}\n${senderName ? `ผู้โอน: ${senderName}\n` : ''}🔢 Ref: ${slipRef ?? '-'}${reviewLink}`)
  await savePendingSlip(supabase, { tenantId: tenant.id, lineUserId, slipUrl, amount, paidAt, slipRef, senderName, slipokStatus: 'no_match' })
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
        continue
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
