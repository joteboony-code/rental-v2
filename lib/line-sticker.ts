export const PAYMENT_THANK_YOU_STICKER = {
  type: 'sticker',
  packageId: '8515',
  stickerId: '16581243',
} as const

export function withPaymentThankYou(message: object): object[] {
  return [message, PAYMENT_THANK_YOU_STICKER]
}
