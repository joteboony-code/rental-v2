'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function submitLead(
  _: unknown,
  formData: FormData
): Promise<{ success: boolean; message: string }> {
  const name  = String(formData.get('name')  ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const note  = String(formData.get('note')  ?? '').trim()

  if (!name)  return { success: false, message: 'กรุณากรอกชื่อ' }
  if (!phone) return { success: false, message: 'กรุณากรอกเบอร์โทร' }

  // ใช้ service client เพื่อ bypass RLS (public submission)
  const supabase = createServiceClient()
  const { error } = await supabase.from('leads').insert({ name, phone, note: note || null })

  if (error) return { success: false, message: `เกิดข้อผิดพลาด: ${error.message}` }
  return { success: true, message: 'ฝากข้อมูลไว้เรียบร้อยแล้ว เจ้าของหอจะติดต่อกลับโดยเร็ว' }
}

export async function updateLeadStatus(
  id: string,
  status: 'new' | 'contacted' | 'converted' | 'dismissed'
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('leads').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return {}
}

export async function deleteLead(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return {}
}
