'use server'

import { getAuthedUser } from '@/lib/require-admin'
import { createClient } from '@/lib/supabase/server'

export interface MeterOcrResult {
  value: number | null
  rawText: string
  error?: string
}

async function getGoogleAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)

  function b64url(str: string): string {
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }))

  const signingInput = `${header}.${payload}`

  const pemBody = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${sig}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) {
    throw new Error(tokenData.error ?? 'ไม่ได้รับ access token จาก Google')
  }
  return tokenData.access_token
}

function extractMeterValue(text: string): number | null {
  const matches = text.match(/\d[\d,]*\.?\d*/g)
  if (!matches) return null

  const nums = matches
    .map((m) => parseFloat(m.replace(/,/g, '')))
    .filter((n) => !isNaN(n) && n >= 100 && n <= 9_999_999)

  if (nums.length === 0) return null

  // Prefer typical meter range: 4–6 digits
  const meterLike = nums.filter((n) => n >= 1000 && n <= 99_999)
  return meterLike.length > 0 ? meterLike[0] : nums[0]
}

export async function readMeterOCR(formData: FormData): Promise<MeterOcrResult> {
  if (!(await getAuthedUser())) {
    return { value: null, rawText: '', error: 'กรุณายืนยันตัวตน 2 ชั้นก่อนใช้งาน OCR' }
  }

  const supabase = await createClient()
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('meter_ocr_enabled')
    .eq('id', 1)
    .single()

  if (settingsError) {
    return { value: null, rawText: '', error: 'ตรวจสอบสถานะ OCR ไม่สำเร็จ' }
  }
  if (settings?.meter_ocr_enabled === false) {
    return { value: null, rawText: '', error: 'ระบบ OCR ถูกปิดอยู่ในการตั้งค่า' }
  }

  const saJson = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON
  if (!saJson) {
    return { value: null, rawText: '', error: 'ยังไม่ได้ตั้งค่า GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON' }
  }

  const file = formData.get('image') as File | null
  if (!file || file.size === 0) {
    return { value: null, rawText: '', error: 'ไม่พบรูปภาพ' }
  }

  const ALLOWED_OCR_TYPES: Record<string, true> = {
    'image/jpeg': true, 'image/png': true, 'image/webp': true,
  }
  if (!ALLOWED_OCR_TYPES[file.type]) {
    return { value: null, rawText: '', error: 'รองรับเฉพาะ JPEG, PNG, WebP เท่านั้น' }
  }

  const MAX_OCR_SIZE = 10 * 1024 * 1024
  if (file.size > MAX_OCR_SIZE) {
    return { value: null, rawText: '', error: 'ไฟล์ใหญ่เกิน 10 MB' }
  }

  try {
    const accessToken = await getGoogleAccessToken(saJson)

    // Base64-encode in chunks to avoid call stack overflow on large images
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)

    const res = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image:    { content: base64 },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    })

    const data = await res.json() as {
      responses?: Array<{
        textAnnotations?: Array<{ description: string }>
        error?: { message: string }
      }>
    }

    const response = data.responses?.[0]
    if (response?.error) {
      return { value: null, rawText: '', error: response.error.message }
    }

    const rawText = response?.textAnnotations?.[0]?.description ?? ''
    const value   = extractMeterValue(rawText)

    return { value, rawText: rawText.replace(/\n/g, ' ').slice(0, 300) }
  } catch (err) {
    return { value: null, rawText: '', error: `OCR ไม่สำเร็จ: ${String(err)}` }
  }
}
