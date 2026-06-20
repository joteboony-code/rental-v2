// ศูนย์กลาง mapping สีตามสถานะของทั้งระบบ (ห้อง/บิล/ซ่อม) ใช้ร่วมกันโดย StatusBadge และหน้าต่าง ๆ
export type StatusTone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'orange' | 'sky' | 'teal'

export type StatusVisual = {
  label: string
  tone: StatusTone
  pulse?: boolean
}

const toneClassName: Record<StatusTone, string> = {
  slate:   'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  blue:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  amber:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  rose:    'bg-rose-50 text-rose-700 ring-1 ring-rose-300',
  violet:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  orange:  'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  sky:     'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  teal:    'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
}

const toneDotClassName: Record<StatusTone, string> = {
  slate:   'bg-slate-400',
  blue:    'bg-blue-400',
  emerald: 'bg-emerald-400',
  amber:   'bg-amber-400',
  rose:    'bg-rose-500',
  violet:  'bg-violet-400',
  orange:  'bg-orange-400',
  sky:     'bg-sky-400',
  teal:    'bg-teal-400',
}

export function toneClass(tone: StatusTone) {
  return toneClassName[tone]
}

export function toneDotClass(tone: StatusTone) {
  return toneDotClassName[tone]
}

export const roomStatusVisual: Record<string, StatusVisual> = {
  available:   { label: 'ว่าง',       tone: 'blue' },
  occupied:    { label: 'มีผู้เช่า',   tone: 'emerald' },
  maintenance: { label: 'ซ่อมบำรุง',  tone: 'amber' },
  reserved:    { label: 'จอง',        tone: 'violet' },
}

export const billStatusVisual: Record<string, StatusVisual> = {
  pending:   { label: 'รอชำระ',    tone: 'amber' },
  paid:      { label: 'ชำระแล้ว',  tone: 'emerald' },
  overdue:   { label: 'เกินกำหนด', tone: 'rose', pulse: true },
  cancelled: { label: 'ยกเลิก',    tone: 'slate' },
}

export const repairStatusVisual: Record<string, StatusVisual> = {
  pending:     { label: 'รอดำเนินการ', tone: 'amber' },
  in_progress: { label: 'กำลังซ่อม',   tone: 'blue' },
  done:        { label: 'เสร็จแล้ว',   tone: 'emerald' },
  cancelled:   { label: 'ยกเลิก',      tone: 'slate' },
}

export const repairPriorityVisual: Record<string, StatusVisual> = {
  low:    { label: 'ต่ำ',      tone: 'slate' },
  normal: { label: 'ปกติ',     tone: 'sky' },
  high:   { label: 'สูง',      tone: 'orange' },
  urgent: { label: 'ด่วนมาก',  tone: 'rose', pulse: true },
}

export const paymentReviewStatusVisual: Record<string, StatusVisual> = {
  pending:  { label: 'รอตรวจสอบ', tone: 'amber' },
  approved: { label: 'ผ่าน',      tone: 'emerald' },
  rejected: { label: 'ไม่ผ่าน',   tone: 'rose' },
}

export function fallbackVisual(status: string): StatusVisual {
  return { label: status, tone: 'slate' }
}
