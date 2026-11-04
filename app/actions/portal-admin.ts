'use server'

import { getAuthedUser } from '@/lib/require-admin'
import { createServiceClient } from '@/lib/supabase/service'
import { roomRow } from '@/lib/room-utils'
import type { PortalRepairItem, PortalRoom, TenantPortalData } from './portal'
import { createSignedStorageUrl } from '@/lib/storage-urls'

type AdminPortalResult =
  | { success: true; data: TenantPortalData }
  | { success: false; message: string }

async function requireAdmin() {
  const user = await getAuthedUser()
  if (!user) return null
  return createServiceClient()
}

export async function getAdminPortalRooms(): Promise<{
  success: boolean
  rooms: PortalRoom[]
  message?: string
}> {
  const supabase = await requireAdmin()
  if (!supabase) return { success: false, rooms: [], message: 'ไม่มีสิทธิ์ดูข้อมูล Portal' }

  const { data, error } = await supabase
    .from('contracts')
    .select('room_id, monthly_rent, rooms(room_number, floor)')
    .eq('status', 'active')
    .order('start_date', { ascending: true })

  if (error) return { success: false, rooms: [], message: error.message }

  type Row = {
    room_id: string
    monthly_rent: number
    rooms: { room_number: string; floor: number | null } | null
  }
  const uniqueRooms = new Map<string, PortalRoom>()
  for (const item of (data ?? []) as unknown as Row[]) {
    uniqueRooms.set(item.room_id, {
      room_id: item.room_id,
      room_number: item.rooms?.room_number ?? '—',
      floor: item.rooms?.floor ?? null,
      monthly_rent: Number(item.monthly_rent),
    })
  }

  const rooms = [...uniqueRooms.values()].sort(
    (a, b) => (Number(a.room_number) || 0) - (Number(b.room_number) || 0)
  )
  return { success: true, rooms }
}

export async function getAdminTenantPortalDashboard(roomId: string): Promise<AdminPortalResult> {
  const supabase = await requireAdmin()
  if (!supabase) return { success: false, message: 'ไม่มีสิทธิ์ดูข้อมูล Portal' }

  const { data: rawContract, error: contractError } = await supabase
    .from('contracts')
    .select(`
      id, tenant_id, room_id, start_date, end_date, monthly_rent, deposit_paid,
      tenants(id, full_name, phone),
      rooms(id, room_number, floor)
    `)
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (contractError) return { success: false, message: contractError.message }
  if (!rawContract) return { success: false, message: 'ห้องนี้ไม่มีสัญญาเช่าที่ใช้งานอยู่' }

  type ContractRow = {
    id: string
    tenant_id: string
    room_id: string
    start_date: string
    end_date: string | null
    monthly_rent: number
    deposit_paid: number
    tenants: { id: string; full_name: string; phone: string | null } | null
    rooms: { id: string; room_number: string; floor: number | null } | null
  }
  const contract = rawContract as unknown as ContractRow
  if (!contract.tenants || !contract.rooms) {
    return { success: false, message: 'ข้อมูลผู้เช่าหรือห้องไม่สมบูรณ์' }
  }

  const [{ data: rawBills, error: billsError }, { data: settings }] = await Promise.all([
    supabase
      .from('bills')
      .select(`
        id, billing_month, due_date, status,
        rent_amount, water_amount, electricity_amount, wifi_amount, trash_amount,
        other_amount, other_note, total_amount,
        meter_readings(
          water_prev, water_curr, water_units,
          electricity_prev, electricity_curr, electricity_units,
          water_image_url, electricity_image_url
        ),
        payments(id, amount, payment_method, slip_url, paid_at)
      `)
      .eq('contract_id', contract.id)
      .order('billing_month', { ascending: false })
      .limit(24),
    supabase
      .from('settings')
      .select('promptpay_id, promptpay_name, bank_account_no, bank_account_name, bank_name, bank_name_1, bank_account_no_1, bank_account_name_1, bank_name_2, bank_account_no_2, bank_account_name_2, bank_name_3, bank_account_no_3, bank_account_name_3, bank_name_4, bank_account_no_4, bank_account_name_4, bank_name_5, bank_account_no_5, bank_account_name_5')
      .eq('id', 1)
      .maybeSingle(),
  ])

  if (billsError) return { success: false, message: billsError.message }

  type MeterRow = NonNullable<TenantPortalData['bills'][number]['meter']>
  type PaymentRow = TenantPortalData['bills'][number]['payments'][number]
  type BillRow = Omit<TenantPortalData['bills'][number], 'paid_amount' | 'remaining_amount' | 'meter' | 'payments'> & {
    meter_readings: MeterRow | null
    payments: PaymentRow[] | null
  }

  const bills = await Promise.all(((rawBills ?? []) as unknown as BillRow[]).map(async (bill) => {
    const payments = await Promise.all((bill.payments ?? [])
      .slice()
      .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
      .map(async (payment) => {
        if (!payment.slip_url) return payment
        const path = payment.slip_url.split('/payment-slips/')[1]
        if (!path) return { ...payment, slip_url: null }
        const { data: signed } = await supabase.storage
          .from('payment-slips')
          .createSignedUrl(path, 3600)
        return { ...payment, slip_url: signed?.signedUrl ?? null }
      }))
    const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    const totalAmount = Number(bill.total_amount)
    const [waterImageUrl, electricityImageUrl] = bill.meter_readings
      ? await Promise.all([
          createSignedStorageUrl(supabase, 'meter-photos', bill.meter_readings.water_image_url, 3600),
          createSignedStorageUrl(supabase, 'meter-photos', bill.meter_readings.electricity_image_url, 3600),
        ])
      : [null, null]
    const meter = bill.meter_readings
      ? {
          ...bill.meter_readings,
          water_image_url: waterImageUrl,
          electricity_image_url: electricityImageUrl,
        }
      : null

    return {
      id: bill.id,
      billing_month: bill.billing_month,
      due_date: bill.due_date,
      status: bill.status,
      rent_amount: Number(bill.rent_amount),
      water_amount: Number(bill.water_amount),
      electricity_amount: Number(bill.electricity_amount),
      wifi_amount: Number(bill.wifi_amount),
      trash_amount: Number(bill.trash_amount),
      other_amount: Number(bill.other_amount),
      other_note: bill.other_note,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining_amount: Math.max(0, totalAmount - paidAmount),
      meter: meter
        ? {
            ...meter,
            water_prev: Number(meter.water_prev),
            water_curr: Number(meter.water_curr),
            water_units: Number(meter.water_units),
            electricity_prev: Number(meter.electricity_prev),
            electricity_curr: Number(meter.electricity_curr),
            electricity_units: Number(meter.electricity_units),
          }
        : null,
      payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
    }
  }))

  const roomRowNum = contract.rooms?.room_number ? roomRow(contract.rooms.room_number) : 0
  const s = settings as Record<string, string | null> | null
  const suffix = roomRowNum >= 1 && roomRowNum <= 5 ? `_${roomRowNum}` : ''
  const bankName    = (suffix ? s?.[`bank_name${suffix}`]         : s?.bank_name)         ?? null
  const accountNo   = (suffix ? s?.[`bank_account_no${suffix}`]   : s?.bank_account_no)   ?? null
  const accountName = (suffix ? s?.[`bank_account_name${suffix}`] : s?.bank_account_name) ?? null

  return {
    success: true,
    data: {
      tenant: contract.tenants,
      room: contract.rooms,
      contract: {
        id: contract.id,
        start_date: contract.start_date,
        end_date: contract.end_date,
        monthly_rent: Number(contract.monthly_rent),
        deposit_paid: Number(contract.deposit_paid),
      },
      bills,
      promptpay: {
        id: settings?.promptpay_id ?? null,
        name: settings?.promptpay_name ?? null,
      },
      bankAccount: {
        bankName,
        accountNo,
        accountName,
      },
      bankAccountRow: roomRowNum,
    },
  }
}

export async function getAdminPortalRepairs(roomId: string): Promise<{
  success: boolean
  repairs?: PortalRepairItem[]
  message?: string
}> {
  const supabase = await requireAdmin()
  if (!supabase) return { success: false, message: 'ไม่มีสิทธิ์ดูข้อมูล Portal' }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('tenant_id')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (contractError) return { success: false, message: contractError.message }
  if (!contract) return { success: false, message: 'ห้องนี้ไม่มีสัญญาเช่าที่ใช้งานอยู่' }

  const { data, error } = await supabase
    .from('repair_requests')
    .select('id, title, description, photo_url, status, priority, admin_note, created_at')
    .eq('room_id', roomId)
    .eq('tenant_id', contract.tenant_id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { success: false, message: error.message }
  const repairs = await Promise.all(((data ?? []) as PortalRepairItem[]).map(async (repair) => ({
    ...repair,
    photo_url: await createSignedStorageUrl(supabase, 'repair-photos', repair.photo_url, 3600),
  })))
  return { success: true, repairs }
}
