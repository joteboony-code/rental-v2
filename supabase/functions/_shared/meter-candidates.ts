export function extractMeterCandidates(
  rawText: string,
  previousValue: number,
  limit = 3
): number[] {
  const candidates = new Map<number, { score: number; order: number }>()
  let order = 0

  function add(value: number, sourceBonus = 0) {
    if (!Number.isFinite(value) || value < 0 || value > 9_999_999) return
    const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2))
    if (rounded < previousValue) return

    const delta = rounded - previousValue
    const digitDistance = Math.abs(
      Math.trunc(rounded).toString().length - Math.trunc(previousValue).toString().length
    )
    let score = sourceBonus - digitDistance * 12
    if (delta <= 1_000) score += 80
    else if (delta <= 10_000) score += 45
    else if (delta <= 100_000) score += 10
    else score -= 40
    if (Number.isInteger(rounded)) score += 8

    const existing = candidates.get(rounded)
    if (!existing || score > existing.score) candidates.set(rounded, { score, order: order++ })
  }

  const normalized = rawText.replace(/[Oo]/g, '0')
  const tokens = normalized.match(/\d[\d,]*\.?\d*/g) ?? []
  for (const token of tokens) {
    const cleaned = token.replace(/,/g, '')
    const parsed = Number(cleaned)
    add(parsed, 30)
    if (cleaned.includes('.')) add(Number(cleaned.split('.')[0]), 38)

    const digits = cleaned.replace(/\D/g, '')
    if (digits.length >= 5) add(Number(digits.slice(0, -1)), 12)
  }

  for (const line of normalized.split(/\r?\n/)) {
    const digits = line.replace(/\D/g, '')
    if (digits.length >= 3 && digits.length <= 8) add(Number(digits), 24)
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order)
    .slice(0, Math.max(1, limit))
    .map(([value]) => value)
}
