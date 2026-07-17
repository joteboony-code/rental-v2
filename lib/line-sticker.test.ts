import { describe, expect, it } from 'vitest'
import { PAYMENT_THANK_YOU_STICKER, withPaymentThankYou } from './line-sticker'

describe('payment thank-you sticker', () => {
  it('uses the approved LINE Messaging API sticker', () => {
    expect(PAYMENT_THANK_YOU_STICKER).toEqual({
      type: 'sticker',
      packageId: '8522',
      stickerId: '16581267',
    })
  })

  it('places the sticker after the payment confirmation', () => {
    const confirmation = { type: 'flex', altText: 'ชำระครบแล้ว' }
    expect(withPaymentThankYou(confirmation)).toEqual([
      confirmation,
      PAYMENT_THANK_YOU_STICKER,
    ])
  })
})
