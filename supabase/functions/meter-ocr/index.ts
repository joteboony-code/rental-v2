// Supabase Edge Function (Deno runtime)
import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractMeterCandidates } from '../_shared/meter-candidates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function b64url(value: string) {
  return btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getGoogleAccessToken(serviceAccountJson: string) {
  const serviceAccount = JSON.parse(serviceAccountJson) as {
    client_email: string
    private_key: string
  }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signingInput = `${header}.${payload}`
  const pemBody = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(pemBody), (character) => character.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${encodedSignature}`,
    }),
  })
  const token = await tokenResponse.json() as { access_token?: string; error_description?: string }
  if (!token.access_token) throw new Error(token.error_description ?? 'Google authentication failed')
  return token.access_token
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

function jwtAssuranceLevel(token: string) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    return (JSON.parse(atob(padded)) as { aal?: string }).aal ?? null
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const jwt = authorization.replace(/^Bearer\s+/i, '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt)
    const user = userData.user
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)
    const hasVerifiedFactor = (user.factors ?? []).some((factor) => factor.status === 'verified')
    if (hasVerifiedFactor && jwtAssuranceLevel(jwt) !== 'aal2') {
      return json({ error: 'กรุณายืนยันตัวตน 2 ชั้นก่อนใช้งาน OCR' }, 403)
    }

    const [{ data: profile }, { data: settings }] = await Promise.all([
      userClient.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      userClient.from('settings').select('meter_ocr_enabled').eq('id', 1).single(),
    ])
    if (profile?.role !== 'admin') return json({ error: 'Forbidden' }, 403)
    if (settings?.meter_ocr_enabled === false) return json({ error: 'ระบบ OCR ถูกปิดอยู่ในการตั้งค่า' }, 409)

    const body = await request.json() as { path?: string; previousValue?: number }
    const path = String(body.path ?? '')
    const expectedPrefix = `drafts/${user.id}/`
    if (!path.startsWith(expectedPrefix) || !/\/(water|electricity)-[0-9a-f-]+\.jpg$/i.test(path)) {
      return json({ error: 'Invalid meter photo path' }, 400)
    }
    const previousValue = Number(body.previousValue ?? 0)
    if (!Number.isFinite(previousValue) || previousValue < 0) {
      return json({ error: 'Invalid previous meter value' }, 400)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: image, error: downloadError } = await serviceClient.storage
      .from('meter-photos')
      .download(path)
    if (downloadError || !image) return json({ error: 'ไม่พบรูปมิเตอร์ที่อัปโหลด' }, 404)
    if (image.size > 5 * 1024 * 1024) return json({ error: 'ไฟล์ใหญ่เกิน 5 MB' }, 413)

    const serviceAccountJson = Deno.env.get('GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON')
    if (!serviceAccountJson) return json({ error: 'ยังไม่ได้ตั้งค่า Google Vision' }, 503)
    const accessToken = await getGoogleAccessToken(serviceAccountJson)
    const visionResponse = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: bytesToBase64(new Uint8Array(await image.arrayBuffer())) },
          features: [{ type: 'TEXT_DETECTION', maxResults: 10 }],
        }],
      }),
    })
    const vision = await visionResponse.json() as {
      responses?: Array<{
        textAnnotations?: Array<{ description: string }>
        error?: { message: string }
      }>
    }
    const response = vision.responses?.[0]
    if (response?.error) return json({ error: response.error.message }, 502)
    const rawText = response?.textAnnotations?.[0]?.description ?? ''
    return json({
      candidates: extractMeterCandidates(rawText, previousValue, 3),
      rawText: rawText.replace(/\s+/g, ' ').trim().slice(0, 300),
    })
  } catch (error) {
    console.error('[meter-ocr]', error)
    return json({ error: 'OCR ไม่สำเร็จ กรุณากรอกเลขเอง' }, 500)
  }
})
