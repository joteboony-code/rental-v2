'use server'

import { createClient } from '@/lib/supabase/server'

export interface SlipVerifyResult {
  success:     boolean
  amount?:     number
  paidAt?:     string   // ISO datetime-local "YYYY-MM-DDTHH:mm"
  senderName?: string
  error?:      string
}

/** Convert SlipOK transDate+transTime → datetime-local value
 *  transDate: "28/05/2026" (CE) or "28/05/2569" (BE)
 *  transTime: "17:10"
 */
function slipToDatetimeLocal(transDate: string, transTime: string): string | undefined {
  try {
    if (transDate.includes('/')) {
      const parts = transDate.split('/')
      if (parts.length !== 3) return undefined
      const [dd, mm, yyyyStr] = parts
      if (!dd || !mm || !yyyyStr) return undefined
      let year = parseInt(yyyyStr)
      if (isNaN(year)) return undefined
      if (year > 2500) year -= 543
      const result = `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${transTime}`
      const d = new Date(result)
      return isNaN(d.getTime()) ? undefined : result
    }
    // ISO or other format
    const candidate = new Date(`${transDate}T${transTime}`)
    if (!isNaN(candidate.getTime())) return `${transDate}T${transTime}`
    return undefined
  } catch {
    return undefined
  }
}

export async function verifySlip(formData: FormData): Promise<SlipVerifyResult> {
  const supabase = await createClient()

  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('slipok_branch_id, slipok_api_key')
    .eq('id', 1)
    .single()

  if (settingsError) {
    return {
      success: false,
      error: `อ่านค่า SlipOK ไม่ได้: ${settingsError.message}`,
    }
  }

  const branchId = String(settings?.slipok_branch_id ?? '').trim()
  const apiKey = String(settings?.slipok_api_key ?? '').trim()

  if (!branchId || !apiKey) {
    return { success: false, error: 'ยังไม่ได้ตั้งค่า SlipOK Branch ID และ API Key ในหน้าตั้งค่า' }
  }

  const slipFile = formData.get('slip') as File | null
  if (!slipFile || slipFile.size === 0) {
    return { success: false, error: 'ไม่พบไฟล์สลิป' }
  }

  try {
    const body = new FormData()
    body.append('files', slipFile)
    body.append('log', 'true')

    const expectedAmount = String(formData.get('amount') ?? '').trim()
    if (expectedAmount) {
      body.append('amount', expectedAmount)
    }

    const res = await fetch(
      `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`,
      {
        method: 'POST',
        headers: { 'x-authorization': apiKey },
        body,
      }
    )

    const text = await res.text()
    const json = JSON.parse(text) as {
      success: boolean
      code?: number
      message?: string
      data?: {
        amount:    number
        transDate: string
        transTime: string
        sender?: { name?: string }
      }
    }

    if (!json.success || !json.data) {
      return {
        success: false,
        error: json.message
          ? `SlipOK: ${json.message}${json.code ? ` (${json.code})` : ''}`
          : `SlipOK ตรวจไม่ผ่าน (HTTP ${res.status})`,
      }
    }

    const d = json.data
    return {
      success:    true,
      amount:     d.amount,
      paidAt:     d.transDate && d.transTime
                    ? slipToDatetimeLocal(d.transDate, d.transTime) ?? undefined
                    : undefined,
      senderName: d.sender?.name,
    }
  } catch (err) {
    return { success: false, error: `ติดต่อ SlipOK ไม่ได้: ${String(err)}` }
  }
}
