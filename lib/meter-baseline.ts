export const METER_BASELINE_REASONS = {
  repair: 'ซ่อมห้อง',
  meter_replaced: 'เปลี่ยนมิเตอร์',
  meter_fault: 'มิเตอร์เสีย/อ่านค่าผิด',
  owner_usage: 'เจ้าของหรือช่างใช้สาธารณูปโภค',
  other: 'เหตุผลอื่น',
} as const

export type MeterBaselineReason = keyof typeof METER_BASELINE_REASONS

export type ActiveMeterBaseline = {
  id: string
  water_baseline: number
  electricity_baseline: number
  reason_code: MeterBaselineReason
  reason_note: string | null
} | null

export function normalizeBillingMonth(value: string): string | null {
  const match = /^(\d{4})-(\d{2})(?:-01)?$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return `${match[1]}-${match[2]}-01`
}

export function isMeterBaselineReason(value: string): value is MeterBaselineReason {
  return Object.prototype.hasOwnProperty.call(METER_BASELINE_REASONS, value)
}

export function resolveMeterBaseline(
  previousWater: number,
  previousElectricity: number,
  adjustment: ActiveMeterBaseline
) {
  if (!adjustment) {
    return {
      water: previousWater,
      electricity: previousElectricity,
      adjusted: false,
      adjustmentId: null,
      reason: null,
    }
  }

  return {
    water: Number(adjustment.water_baseline),
    electricity: Number(adjustment.electricity_baseline),
    adjusted: true,
    adjustmentId: adjustment.id,
    reason: METER_BASELINE_REASONS[adjustment.reason_code],
  }
}
