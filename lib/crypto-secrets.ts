const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }
  return Buffer.from(bytes).toString('base64')
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (typeof atob === 'function') {
    const binary = atob(value)
    const buf = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
    return buf
  }
  const node = Buffer.from(value, 'base64')
  return new Uint8Array(node.buffer, node.byteOffset, node.byteLength)
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('Missing ENCRYPTION_KEY environment variable')
  }

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(value: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(value)
  )

  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`
}

export async function decryptSecret(encrypted: string): Promise<string> {
  const [version, iv, cipher] = encrypted.split(':')
  if (version !== 'v1' || !iv || !cipher) {
    throw new Error('Unsupported encrypted secret format')
  }

  const key = await getEncryptionKey()
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytesToArrayBuffer(base64ToBytes(iv)) },
    key,
    bytesToArrayBuffer(base64ToBytes(cipher))
  )

  return new TextDecoder().decode(plain)
}

/** ถอดรหัสค่าที่อาจเป็น v1:... (เข้ารหัส) หรือ plaintext เดิม
 *  คืน plaintext ตามเดิมถ้ายังไม่ถูกเข้ารหัส — เพื่อให้ค่าเก่าใช้ได้จนกว่าจะถูกบันทึกใหม่ */
export async function maybeDecryptSecret(value: string | null | undefined): Promise<string> {
  if (!value) return ''
  if (!value.startsWith('v1:')) return value
  return decryptSecret(value)
}

export function secretLast4(value: string): string {
  return value.slice(-4)
}
