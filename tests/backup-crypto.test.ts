import { describe, expect, it } from 'vitest'
import {
  backupObjectPath,
  decryptBackupPayload,
  encryptBackupPayload,
} from '@/lib/backup-crypto'

describe('backup encryption', () => {
  it('round-trips an encrypted payload', async () => {
    const input = new TextEncoder().encode('ข้อมูลสำรอง rental-v2').buffer
    const encrypted = await encryptBackupPayload(input, 'test-secret')
    const decrypted = await decryptBackupPayload(encrypted, 'test-secret')

    expect(new TextDecoder().decode(decrypted)).toBe('ข้อมูลสำรอง rental-v2')
    expect(new Uint8Array(encrypted)).not.toEqual(new Uint8Array(input))
  })

  it('rejects a wrong key', async () => {
    const input = new TextEncoder().encode('private').buffer
    const encrypted = await encryptBackupPayload(input, 'correct-secret')

    await expect(decryptBackupPayload(encrypted, 'wrong-secret')).rejects.toThrow()
  })

  it('encodes storage path segments safely', () => {
    expect(backupObjectPath('/tenant docs/สัญญา 1.pdf')).toBe(
      'tenant%20docs/%E0%B8%AA%E0%B8%B1%E0%B8%8D%E0%B8%8D%E0%B8%B2%201.pdf'
    )
  })
})
