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
      const code = json.code
      const thaiMsg = code === 1012 ? 'สลิปนี้เคยถูกใช้แล้ว ไม่สามารถใช้ซ้ำได้'
        : code === 1014 ? 'บัญชีผู้รับไม่ตรงกับบัญชีของร้าน กรุณาโอนมาที่บัญชีที่ถูกต้อง'
        : code === 1013 ? 'สลิปหมดอายุแล้ว กรุณาส่งสลิปใหม่'
        : code === 1001 ? 'API Key ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า SlipOK'
        : code === 1002 ? 'Branch ID ไม่ถูกต้อง กรุณาตรวจสอบการตั้งค่า SlipOK'
        : code === 1003 ? 'ไฟล์รูปใหญ่เกินไป กรุณาส่งรูปขนาดเล็กกว่านี้'
        : code === 1004 ? 'รูปแบบไฟล์ไม่รองรับ กรุณาใช้ไฟล์ JPG หรือ PNG'
        : code === 1006 ? 'เกินจำนวนครั้งที่ใช้ได้ต่อวัน กรุณาลองใหม่พรุ่งนี้'
        : code === 1007 ? 'เครดิต SlipOK หมดแล้ว กรุณาเติมเครดิต'
        : code === 1008 ? 'ยอดเงินในสลิปไม่ตรงกับที่ระบุ'
        : code === 1009 ? 'ไม่พบรายการโอนนี้ในระบบ'
        : code === 1011 ? 'ไม่พบบัญชีผู้รับ'
        : code === 1015 ? 'QR Code ในสลิปไม่ถูกต้อง'
        : json.message ?? 'ตรวจสลิปไม่ผ่าน กรุณาลองใหม่หรือติดต่อเจ้าของหอ'
      return {
        success: false,
        error: thaiMsg,
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
