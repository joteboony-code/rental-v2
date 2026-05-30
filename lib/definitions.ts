import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.email({ error: 'กรุณากรอก email ที่ถูกต้อง' }).trim(),
  password: z.string().min(6, { error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }),
})

export const RegisterSchema = z
  .object({
    email: z.email({ error: 'กรุณากรอก email ที่ถูกต้อง' }).trim(),
    password: z
      .string()
      .min(8, { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
      .regex(/[A-Za-z]/, { error: 'ต้องมีตัวอักษรอย่างน้อย 1 ตัว' })
      .regex(/[0-9]/, { error: 'ต้องมีตัวเลขอย่างน้อย 1 ตัว' }),
    confirmPassword: z.string(),
    fullName: z
      .string()
      .min(2, { error: 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร' })
      .trim(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'รหัสผ่านไม่ตรงกัน',
    path: ['confirmPassword'],
  })

export type LoginFormState =
  | { errors?: { email?: string[]; password?: string[] }; message?: string }
  | undefined

export type RegisterFormState =
  | {
      errors?: {
        email?: string[]
        password?: string[]
        confirmPassword?: string[]
        fullName?: string[]
      }
      message?: string
    }
  | undefined

export type UserRole = 'admin' | 'tenant'

// ============================================================
// ROOMS
// ============================================================
export const RoomSchema = z.object({
  room_number:  z.string().min(1, { error: 'กรุณากรอกเลขห้อง' }).trim(),
  floor:        z.coerce.number().int().nullable().optional(),
  room_type:    z.enum(['standard', 'deluxe', 'suite']),
  size_sqm:     z.coerce.number().positive().nullable().optional(),
  monthly_rent: z.coerce.number().positive({ error: 'กรุณากรอกค่าเช่า' }),
  deposit:      z.coerce.number().min(0).default(0),
  wifi_fee:     z.coerce.number().min(0).nullable().optional(),
  status:       z.enum(['available', 'occupied', 'maintenance', 'reserved']),
  description:  z.string().optional(),
})

export type RoomFormData = z.infer<typeof RoomSchema>

export type RoomFormState =
  | {
      errors?: {
        room_number?:  string[]
        floor?:        string[]
        room_type?:    string[]
        size_sqm?:     string[]
        monthly_rent?: string[]
        deposit?:      string[]
        status?:       string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export type Room = {
  id:           string
  room_number:  string
  floor:        number | null
  room_type:    'standard' | 'deluxe' | 'suite'
  size_sqm:     number | null
  monthly_rent: number
  deposit:      number
  wifi_fee:     number | null
  status:       'available' | 'occupied' | 'maintenance' | 'reserved'
  description:  string | null
  created_at:   string
  updated_at:   string
}

// ============================================================
// TENANTS
// ============================================================
export const TenantSchema = z.object({
  full_name:          z.string().min(2, { error: 'กรุณากรอกชื่อ-นามสกุล' }).trim(),
  phone:              z.string().optional(),
  line_user_id:       z.string().optional(),
  id_card:            z.string().optional(),
  emergency_contact:  z.string().optional(),
  emergency_phone:    z.string().optional(),
  note:               z.string().optional(),
})

export type TenantFormData = z.infer<typeof TenantSchema>

export type TenantFormState =
  | {
      errors?: {
        full_name?:         string[]
        phone?:             string[]
        line_user_id?:      string[]
        id_card?:           string[]
        emergency_contact?: string[]
        emergency_phone?:   string[]
        note?:              string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export type Tenant = {
  id:                 string
  full_name:          string
  phone:              string | null
  line_user_id:       string | null
  id_card:            string | null
  emergency_contact:  string | null
  emergency_phone:    string | null
  note:               string | null
  contract_images:    string[]
  created_at:         string
  updated_at:         string
}

// ============================================================
// CONTRACTS
// ============================================================
export const ContractSchema = z.object({
  room_id:      z.string().uuid({ error: 'กรุณาเลือกห้อง' }),
  tenant_id:    z.string().uuid({ error: 'กรุณาเลือกผู้เช่า' }),
  start_date:   z.string().min(1, { error: 'กรุณาระบุวันเริ่มสัญญา' }),
  end_date:     z.string().optional(),
  monthly_rent: z.coerce.number().positive({ error: 'กรุณากรอกค่าเช่า' }),
  deposit_paid: z.coerce.number().min(0).default(0),
  note:         z.string().optional(),
})

export type ContractFormData = z.infer<typeof ContractSchema>

export type ContractFormState =
  | {
      errors?: {
        room_id?:      string[]
        tenant_id?:    string[]
        start_date?:   string[]
        end_date?:     string[]
        monthly_rent?: string[]
        deposit_paid?: string[]
        note?:         string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export type Contract = {
  id:           string
  room_id:      string
  tenant_id:    string
  start_date:   string
  end_date:     string | null
  monthly_rent: number
  deposit_paid: number
  status:       'active' | 'expired' | 'terminated'
  note:         string | null
  created_at:   string
  updated_at:   string
  // joined
  rooms?:       Pick<Room, 'room_number' | 'floor'>
  tenants?:     Pick<Tenant, 'full_name' | 'phone'>
}

// ============================================================
// METER READINGS
// ============================================================
export type MeterReading = {
  id:                   string
  room_id:              string
  billing_month:        string
  water_prev:           number
  water_curr:           number
  water_units:          number
  electricity_prev:     number
  electricity_curr:     number
  electricity_units:    number
  recorded_by:          string | null
  created_at:           string
}

// ============================================================
// BILLS
// ============================================================
export type BillStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'

export type Bill = {
  id:                  string
  contract_id:         string
  room_id:             string
  tenant_id:           string
  meter_reading_id:    string | null
  billing_month:       string
  due_date:            string
  rent_amount:         number
  water_amount:        number
  electricity_amount:  number
  other_amount:        number
  other_note:          string | null
  wifi_amount:         number
  trash_amount:        number
  total_amount:        number
  snooze_until:        string | null
  snooze_note:         string | null
  status:              BillStatus
  created_at:          string
  updated_at:          string
  // joined
  rooms?:              Pick<Room, 'room_number' | 'floor'>
  tenants?:            Pick<Tenant, 'full_name' | 'phone'>
}

// ============================================================
// SETTINGS
// ============================================================
export const SettingsSchema = z.object({
  water_unit_price:             z.coerce.number().positive({ error: 'กรุณากรอกอัตราค่าน้ำ' }),
  electricity_unit_price:       z.coerce.number().positive({ error: 'กรุณากรอกอัตราค่าไฟ' }),
  late_fee_per_day:             z.coerce.number().min(0),
  billing_day:                  z.coerce.number().int().min(1).max(28),
  due_day:                      z.coerce.number().int().min(1).max(28),
  promptpay_id:                 z.string().optional().default(''),
  promptpay_name:               z.string().optional().default('ห้องเช่า'),
  trash_fee:                    z.coerce.number().min(0).default(50),
  reminder_days:                z.string().optional().default('5,10'),
  reminder_enabled:             z.boolean().default(true),
  anomaly_threshold_pct:        z.coerce.number().int().min(10).max(500).default(50),
  slipok_branch_id:             z.string().optional().default(''),
  bank_accounts_text:           z.string().optional().default(''),
})

export const LineIntegrationSchema = z.object({
  line_channel_access_token: z.string().optional().default(''),
  line_channel_secret:       z.string().optional().default(''),
  line_oa_basic_id:          z.string().optional().default(''),
  line_liff_id:              z.string().optional().default(''),
  app_url:                   z.string().url().optional().or(z.literal('')).default(''),
  owner_line_user_id:        z.string().optional().default(''),
})

export type SettingsFormState =
  | {
      errors?: {
        water_unit_price?:             string[]
        electricity_unit_price?:       string[]
        late_fee_per_day?:             string[]
        billing_day?:                  string[]
        due_day?:                      string[]
        promptpay_id?:                 string[]
        promptpay_name?:               string[]
        line_channel_access_token?:    string[]
        line_channel_secret?:          string[]
        line_oa_basic_id?:             string[]
        line_liff_id?:                 string[]
        app_url?:                      string[]
        owner_line_user_id?:           string[]
        slipok_branch_id?:             string[]
      }
      message?: string
      success?: boolean
    }
  | undefined

export type Settings = {
  id:                             number
  water_unit_price:               number
  electricity_unit_price:         number
  late_fee_per_day:               number
  billing_day:                    number
  due_day:                        number
  promptpay_id:                   string
  promptpay_name:                 string
  trash_fee:                      number
  current_billing_month:          string | null
  reminder_days:                  string    // "5,10" format
  reminder_enabled:               boolean
  anomaly_threshold_pct:          number    // % increase to flag as anomaly
  slipok_branch_id:                string | null
  bank_accounts_text:             string | null
  updated_at:                     string
}

// ============================================================
// PAYMENTS
// ============================================================
export type PaymentMethod = 'cash' | 'transfer' | 'qr' | 'other'

export type Payment = {
  id:             string
  bill_id:        string
  amount:         number
  payment_method: PaymentMethod
  slip_url:       string | null
  note:           string | null
  paid_at:        string
  recorded_by:    string | null
  created_at:     string
}

// ============================================================
// REPAIR REQUESTS
// ============================================================
export type RepairStatus   = 'pending' | 'in_progress' | 'done' | 'cancelled'
export type RepairPriority = 'low' | 'normal' | 'high' | 'urgent'

export const RepairSchema = z.object({
  room_id:     z.string().uuid({ error: 'กรุณาเลือกห้อง' }),
  tenant_id:   z.string().uuid().optional(),
  title:       z.string().min(1, { error: 'กรุณาระบุหัวข้อ' }).trim(),
  description: z.string().optional(),
  priority:    z.enum(['low', 'normal', 'high', 'urgent']),
})

export type RepairFormState =
  | {
      errors?: {
        room_id?:     string[]
        title?:       string[]
        priority?:    string[]
        description?: string[]
      }
      message?: string
      success?: boolean
      id?:      string
    }
  | undefined

export type RepairRequest = {
  id:          string
  room_id:     string
  tenant_id:   string | null
  title:       string
  description: string | null
  photo_url:   string | null
  status:      RepairStatus
  priority:    RepairPriority
  admin_note:  string | null
  created_at:  string
  updated_at:  string
  // joined
  rooms?:      Pick<Room, 'room_number' | 'floor'>
  tenants?:    Pick<Tenant, 'full_name'>
}
