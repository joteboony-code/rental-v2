'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type MessageTemplate = {
  id: string
  template_key: string
  title: string
  body: string
  enabled: boolean
  updated_at: string
}

export async function getTemplates(): Promise<MessageTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('line_message_templates')
    .select('*')
    .order('template_key', { ascending: true })
  return (data ?? []) as MessageTemplate[]
}

export async function updateTemplate(
  id: string,
  body: string,
  enabled: boolean
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('line_message_templates')
    .update({ body, enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { success: false, message: error.message }
  revalidatePath('/settings/templates')
  return { success: true, message: 'บันทึกแล้ว' }
}
