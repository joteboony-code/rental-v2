const encoder = new TextEncoder()
const MAGIC = encoder.encode('RNTBKP01')
const IV_LENGTH = 12

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function importBackupKey(secret: string): Promise<CryptoKey> {
  if (!secret.trim()) throw new Error('Backup encryption key is empty')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`rental-v2-backup:${secret}`))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptBackupPayload(
  payload: ArrayBuffer,
  secret: string
): Promise<ArrayBuffer> {
  const key = await importBackupKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload)
  const output = new Uint8Array(MAGIC.length + iv.length + cipher.byteLength)
  output.set(MAGIC, 0)
  output.set(iv, MAGIC.length)
  output.set(new Uint8Array(cipher), MAGIC.length + iv.length)
  return output.buffer
}

export async function decryptBackupPayload(
  payload: ArrayBuffer,
  secret: string
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(payload)
  if (
    bytes.length <= MAGIC.length + IV_LENGTH ||
    !MAGIC.every((byte, index) => bytes[index] === byte)
  ) {
    throw new Error('Invalid backup payload')
  }

  const key = await importBackupKey(secret)
  const iv = bytes.slice(MAGIC.length, MAGIC.length + IV_LENGTH)
  const cipher = bytes.slice(MAGIC.length + IV_LENGTH)
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipher)
  )
}

export function backupObjectPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}
