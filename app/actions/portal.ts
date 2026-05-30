'use server'

import { createClient } from '@/lib/supabase/server'

export type TenantPortalData = {
  tenant: {
    id: string
    full_name: string
    phone: string | null
  }
  room: {
    id: string
    room_number: string
    floor: number | null
  } | null
  contract: {
    id: string
    start_date: string
    end_date: string | null
    monthly_rent: number
    deposit_paid: number
  } | null
  bills: Array<{
    id: string
    billing_month: string
    due_date: string
    status: string
    rent_amount: number
    water_amount: number
    electricity_amount: number
    other_amount: number
    other_note: string | null
    total_amount: number
    paid_amount: number
    remaining_amount: number
    meter: {
      water_prev: number
      water_curr: number
      water_units: number
      electricity_prev: number
      electricity_curr: number
      electricity_units: number
      water_image_url: string | null
      electricity_image_url: string | null
    } | null
    payments: Array<{
      id: string
      amount: number
      payment_method: string
      slip_url: string | null
      paid_at: string
    }>
  }>
}

type PortalResult =
  | { success: true; data: TenantPortalData }
  | { success: false; message: string }

export async function getTenantPortalDashboard(lineUserId: string): Promise<PortalResult> {
  const trimmed = lineUserId.trim()
  if (!trimmed) {
    return { success: false, message: 'ไม่พบ LINE User ID' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_tenant_portal_by_line_user', {
    p_line_user_id: trimmed,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  if (!data) {
    return { success: false, message: 'ยังไม่ได้เชื่อม LINE กับห้องพัก' }
  }

  return { success: true, data: data as TenantPortalData }
}
