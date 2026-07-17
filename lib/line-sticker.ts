export const PAYMENT_THANK_YOU_STICKER = {
  type: 'sticker',
  packageId: '8522',
  stickerId: '16581267',
} as const

export function withPaymentThankYou(message: object): object[] {
  return [message, PAYMENT_THANK_YOU_STICKER]
}
