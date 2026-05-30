/** Parse "5,10" → [5, 10] */
export function parseReminderDays(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 31)
    .sort((a, b) => a - b)
}

/** Returns true if today's date matches one of the reminder days */
export function isTodayReminderDay(reminderDays: number[]): boolean {
  return reminderDays.includes(new Date().getDate())
}

/** Returns the next upcoming reminder day number, or wraps to first */
export function nextReminderDay(reminderDays: number[]): number | null {
  const today = new Date().getDate()
  return reminderDays.find((d) => d > today) ?? reminderDays[0] ?? null
}
