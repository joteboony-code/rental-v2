'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthedUser } from '@/lib/require-admin'

export type ExpenseFormState =
  | { success: boolean; message: string }
  | undefined

export async function createExpense(data: {
  category: string
  description: string
  amount: number
  expense_date: string
  room_id?: string | null
  note?: string | null
}): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) {
    return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').insert({
    category:     data.category,
    description:  data.description,
    amount:       data.amount,
    expense_date: data.expense_date,
    room_id:      data.room_id || null,
    note:         data.note || null,
  })

  if (error) return { success: false, message: `เกิดข้อผิดพลาด: ${error.message}` }
  return { success: true, message: 'บันทึกค่าใช้จ่ายแล้ว' }
}

export async function deleteExpense(id: string): Promise<{ success: boolean; message: string }> {
  if (!(await getAuthedUser())) {
    return { success: false, message: 'กรุณายืนยันตัวตน 2 ชั้นก่อนทำรายการ' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)

  if (error) return { success: false, message: `เกิดข้อผิดพลาด: ${error.message}` }
  return { success: true, message: 'ลบรายการแล้ว' }
}
