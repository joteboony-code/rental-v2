import { describe, expect, it } from 'vitest'
import { generatePromptPayPayload } from '@/lib/promptpay'

function parseFields(payload: string): Map<string, string> {
  const fields = new Map<string, string>()
  let offset = 0
  while (offset + 4 <= payload.length) {
    const tag = payload.slice(offset, offset + 2)
    const length = Number(payload.slice(offset + 2, offset + 4))
    const value = payload.slice(offset + 4, offset + 4 + length)
    fields.set(tag, value)
    offset += 4 + length
  }
  return fields
}

function crc16(value: string): string {
  let crc = 0xffff
  for (let i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

describe('PromptPay payloads', () => {
  it('uses mobile subtag 01 and the international Thai phone format', () => {
    const payload = generatePromptPayPayload('0812345678', 3979)
    const merchant = parseFields(payload).get('29') ?? ''

    expect(parseFields(merchant).get('01')).toBe('0066812345678')
    expect(parseFields(merchant).has('02')).toBe(false)
    expect(parseFields(payload).get('54')).toBe('3979.00')
  })

  it('uses National/Tax ID subtag 02 for a 13-digit PromptPay ID', () => {
    const payload = generatePromptPayPayload('1234567890123', 100)
    const merchant = parseFields(payload).get('29') ?? ''

    expect(parseFields(merchant).get('02')).toBe('1234567890123')
    expect(parseFields(merchant).has('01')).toBe(false)
  })

  it('rejects unsupported IDs and appends a valid CRC', () => {
    expect(() => generatePromptPayPayload('12345', 100)).toThrow()

    const payload = generatePromptPayPayload('0812345678', 0.01)
    expect(payload.slice(-8, -4)).toBe('6304')
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)))
  })
})
