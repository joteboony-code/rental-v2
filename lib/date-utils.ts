export const BUSINESS_TIME_ZONE = 'Asia/Bangkok'

export function dateKeyInTimeZone(
  date = new Date(),
  timeZone = BUSINESS_TIME_ZONE
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function bangkokDateKey(date = new Date()): string {
  return dateKeyInTimeZone(date, BUSINESS_TIME_ZONE)
}
