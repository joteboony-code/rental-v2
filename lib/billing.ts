export function dueDateForBillingMonth(billingMonth: string, dueDay: number): string {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(billingMonth)
  if (!match) throw new Error('Invalid billing month')

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12 || dueDay < 1 || dueDay > 28) {
    throw new Error('Invalid billing date')
  }

  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`
}

export function prorateRent(
  monthlyRent: number,
  billingMonth: string,
  startDate: string | null
): number {
  if (!startDate || startDate.slice(0, 7) !== billingMonth.slice(0, 7)) {
    return monthlyRent
  }

  const [year, month] = billingMonth.split('-').map(Number)
  const startDay = Number(startDate.slice(8, 10))
  const daysInMonth = new Date(year, month, 0).getDate()
  if (!Number.isInteger(startDay) || startDay <= 1 || startDay > daysInMonth) {
    return monthlyRent
  }

  return Math.round((monthlyRent * (daysInMonth - startDay + 1)) / daysInMonth)
}
