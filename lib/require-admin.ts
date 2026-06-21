import { createClient } from '@/lib/supabase/server'

/**
 * คืน user ที่ล็อกอินอยู่ (admin) หรือ null ถ้าไม่ได้ล็อกอิน
 *
 * ใช้ในฟังก์ชัน server action ที่เรียก createServiceClient() (bypass RLS)
 * ซึ่งต้องตรวจสิทธิ์ผู้เรียกเอง— เพราะ server action เป็น HTTP endpoint ที่
 * ถูกยิงตรงได้ ไม่ได้ถูกป้องกันด้วย layout/middleware
 *
 * ระบบนี้มี admin คนเดียว และผู้เช่าไม่มี Supabase auth (ใช้ LINE เท่านั้น)
 * ดังนั้นการมี user = เป็น admin
 */
export async function getAuthedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
