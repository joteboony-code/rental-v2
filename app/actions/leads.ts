'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getAuthedUser } from '@/lib/require-admin'
import { isRateLimited, getClientIp } from '@/lib/rate-limit'
import { notifyOwner } from '@/lib/notify-owner'

async function notifyOwnerNewLead(name: string, phone: string, note: string | null) {
  const text = [
    '📬 มีคนสนใจเช่าห้องใหม่',
    `ชื่อ: ${name}`,
    `เบอร์: ${phone}`,
    note ? `หมายเหตุ: ${note}` : '',
    '\nดูรายชื่อได้ที่หน้า "คนสนใจห้อง"',
  ].filter(Boolean).join('\n')

  await notifyOwner(text, 'lead')
}

export async function submitLead(
  _: unknown,
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const name  = String(formData.get('name')  ?? '').trim().slice(0, 100)
  const phone = String(formData.get('phone') ?? '').trim().slice(0, 20)
  const note  = String(formData.get('note')  ?? '').trim().slice(0, 500)

  if (!name)  return { success: false, message: 'กรุณากรอกชื่อ' }
  if (!phone) return { success: false, message: 'กรุณากรอกเบอร์โทร' }
  if (!/^0[6-9]\d{8}$/.test(phone.replace(/[-\s]/g, '')))
    return { success: false, message: 'กรุณากรอกเบอร์มือถือให้ถูกต้อง (ตัวอย่าง: 0812345678)' }

  // Rate limit: 5 submissions per IP per hour
  const ip = await getClientIp()
  if (await isRateLimited(`lead:${ip}`, 5, 3600))
    return { success: true, message: 'ฝากข้อมูลไว้เรียบร้อยแล้ว เจ้าของหอจะติดต่อกลับโดยเร็ว' }

  const supabase = createServiceClient()

  // Dedup: reject if same phone submitted within last 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', phone.replace(/[-\s]/g, ''))
    .gte('created_at', tenMinAgo)
    .maybeSingle()
  if (recent) return { success: true, message: 'ฝากข้อมูลไว้เรียบร้อยแล้ว เจ้าของหอจะติดต่อกลับโดยเร็ว' }

  const cleanPhone = phone.replace(/[-\s]/g, '')
  const { error } = await supabase.from('leads').insert({ name, phone: cleanPhone, note: note || null })

  if (error) return { success: false, message: `เกิดข้อผิดพลาด: ${error.message}` }

  notifyOwnerNewLead(name, cleanPhone, note || null).catch(() => {})

  return { success: true, message: 'ฝากข้อมูลไว้เรียบร้อยแล้ว เจ้าของหอจะติดต่อกลับโดยเร็ว' }
}

export async function updateLeadAnnouncement(text: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ไม่มีสิทธิ์ใช้งาน' }
  const { error } = await supabase
    .from('settings')
    .update({ lead_announcement: text.trim() || null })
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return {}
}

export async function updateLeadStatus(
  id: string,
  status: 'new' | 'contacted' | 'converted' | 'dismissed'
): Promise<{ error?: string }> {
  if (!(await getAuthedUser())) return { error: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()
  const { error } = await supabase.from('leads').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return {}
}

export async function deleteLead(id: string): Promise<{ error?: string }> {
  if (!(await getAuthedUser())) return { error: 'ไม่มีสิทธิ์ใช้งาน' }
  const supabase = await createClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return {}
}

