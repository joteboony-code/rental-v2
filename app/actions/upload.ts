'use server'

import { createClient } from '@/lib/supabase/server'

export async function uploadBroadcastImage(
  formData: FormData
): Promise<{ success: boolean; url?: string; message: string }> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { success: false, message: 'ไม่พบไฟล์' }
  if (file.size > 5 * 1024 * 1024) return { success: false, message: 'ไฟล์ใหญ่เกิน 5MB' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return { success: false, message: 'รองรับเฉพาะ jpg, png, webp, gif' }
  }

  const supabase = await createClient()
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await supabase.storage
    .from('broadcast-images')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })

  if (error || !data) return { success: false, message: error?.message ?? 'อัปโหลดไม่สำเร็จ' }

  const { data: urlData } = supabase.storage.from('broadcast-images').getPublicUrl(data.path)
  return { success: true, url: urlData.publicUrl, message: 'อัปโหลดสำเร็จ' }
}
