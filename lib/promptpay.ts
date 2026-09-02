// PromptPay QR Payload Generator (EMVCo QR Code format)

function lpad(n: string | number, len: number): string {
  return String(n).padStart(len, '0')
}

function field(tag: string, value: string): string {
  return `${tag}${lpad(value.length, 2)}${value}`
}

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Generate a PromptPay QR payload string
 * @param phoneOrId  Phone number (e.g. "0812345678") or National ID (13 digits)
 * @param amount     Optional amount in THB
 */
export function generatePromptPayPayload(phoneOrId: string, amount?: number): string {
  let id = phoneOrId.replace(/\D/g, '')
  let proxyTag: '01' | '02'

  // Phone: 10 digits starting with 0 → convert to 0066XXXXXXXXX (13 chars)
  if (id.startsWith('0') && id.length === 10) {
    id = '0066' + id.slice(1)
    proxyTag = '01'
  } else if (id.length === 13) {
    // Thai QR Payment reserves subtag 02 for National ID / Tax ID.
    proxyTag = '02'
  } else {
    throw new Error('PromptPay ID must be a Thai mobile number or a 13-digit National/Tax ID')
  }

  // Merchant account info (tag 29 for PromptPay)
  const merchantAccount =
    field('00', 'A000000677010111') +  // PromptPay AID
    field(proxyTag, id)

  const payload =
    field('00', '01') +                 // Payload format indicator
    field('01', '12') +                 // Dynamic QR (12) or static (11)
    field('29', merchantAccount) +      // Merchant account info
    field('52', '0000') +              // Merchant category code
    field('53', '764') +               // Currency: THB
    (amount !== undefined && amount > 0
      ? field('54', amount.toFixed(2))
      : '') +
    field('58', 'TH') +               // Country code
    field('59', 'PromptPay') +        // Merchant name (max 25)
    field('60', 'Bangkok') +          // City
    '6304'                             // CRC placeholder

  return payload + crc16(payload)
}
