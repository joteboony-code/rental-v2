export type MeterReadingDetails = {
  water_prev: number | string | null
  water_curr: number | string | null
  water_units: number | string | null
  electricity_prev: number | string | null
  electricity_curr: number | string | null
  electricity_units: number | string | null
}

function formatReading(value: number | string): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return number.toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

function units(
  previous: number | string,
  current: number | string,
  recordedUnits: number | string | null
): number | string {
  if (recordedUnits != null) return recordedUnits
  return Math.max(0, Number(current) - Number(previous))
}

export function formatMeterReadingLines(
  meter: MeterReadingDetails | null | undefined
): string[] {
  if (!meter) return []

  const lines: string[] = []
  if (meter.water_prev != null && meter.water_curr != null) {
    lines.push(
      `💧 น้ำ: ${formatReading(meter.water_prev)} → ${formatReading(meter.water_curr)} = ${formatReading(units(meter.water_prev, meter.water_curr, meter.water_units))} หน่วย`
    )
  }
  if (meter.electricity_prev != null && meter.electricity_curr != null) {
    lines.push(
      `⚡ ไฟ: ${formatReading(meter.electricity_prev)} → ${formatReading(meter.electricity_curr)} = ${formatReading(units(meter.electricity_prev, meter.electricity_curr, meter.electricity_units))} หน่วย`
    )
  }
  return lines
}
