import { createServiceClient } from '@/lib/supabase/service'

export type TemplateKey =
  | 'bill_notify'
  | 'reminder'
  | 'payment_full'
  | 'payment_partial'
  | 'slip_failed'
  | 'slip_received'
  | 'repair_received'
  | 'promise_reminder'

export type TemplateVars = {
  room_number?: string
  tenant_name?: string
  billing_month?: string
  total_amount?: string | number
  paid_amount?: string | number
  remaining_amount?: string | number
  due_date?: string
  portal_url?: string
  promise_date?: string
}

// ข้อความ default — ใช้เมื่อไม่มี template ใน DB (กัน LINE ส่งไม่ได้)
const DEFAULTS: Record<TemplateKey, string> = {
  bill_notify:      '🔔 แจ้งค่าเช่าห้อง {room_number}\nรอบบิล {billing_month}\nยอดรวม {total_amount} บาท\nครบกำหนด {due_date}',
  reminder:         '🚨 แจ้งเตือนค่าเช่าค้างชำระ\nห้อง {room_number} · {tenant_name}\nยอดค้าง {remaining_amount} บาท\nครบกำหนด {due_date}',
  payment_full:     '✅ รับชำระแล้วครับ\nห้อง {room_number}\nรอบบิล {billing_month}\nชำระแล้ว {paid_amount} บาท\nคงเหลือ 0 บาท',
  payment_partial:  '💳 รับชำระบางส่วนแล้วครับ\nห้อง {room_number}\nรอบบิล {billing_month}\nชำระแล้ว {paid_amount} บาท\nยังค้าง {remaining_amount} บาท',
  slip_failed:      '⚠️ สลิปตรวจไม่ผ่านครับ\nกรุณาส่งสลิปที่ชัดเจนอีกครั้ง หรือติดต่อเจ้าของหอ',
  slip_received:    '📨 ได้รับสลิปแล้วครับ\n\nเจ้าของหอจะตรวจสอบและยืนยันให้นะครับ 😊',
  repair_received:  '🔧 รับเรื่องแจ้งซ่อมแล้วครับ\nทีมงานจะติดต่อกลับโดยเร็วครับ',
  promise_reminder: '🤝 ใกล้ถึงวันนัดจ่ายแล้วนะครับ\nห้อง {room_number}\nนัดจ่ายวันที่ {promise_date}\nยอด {remaining_amount} บาท',
}

function interpolate(body: string, vars: TemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = (vars as Record<string, unknown>)[key]
    return v != null ? String(v) : ''
  })
}

/**
 * แปลง template key + ตัวแปร เป็นข้อความพร้อมส่ง
 * อ่าน body จาก DB ถ้ามีและ enabled — ไม่งั้น fallback เป็น default
 * ห้าม throw — คืน default เสมอเมื่อเกิดข้อผิดพลาด
 */
export async function renderTemplate(key: TemplateKey, vars: TemplateVars): Promise<string> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('line_message_templates')
      .select('body, enabled')
      .eq('template_key', key)
      .maybeSingle()

    const body = data?.enabled && data.body ? data.body : DEFAULTS[key]
    return interpolate(body, vars)
  } catch {
    return interpolate(DEFAULTS[key], vars)
  }
}

export function renderTemplateSync(body: string, vars: TemplateVars): string {
  return interpolate(body, vars)
}
