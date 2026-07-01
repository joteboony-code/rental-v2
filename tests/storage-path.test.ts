import { describe, expect, it } from 'vitest'
import { storageObjectPath } from '@/lib/storage-path'

describe('storageObjectPath', () => {
  it('accepts new path-only values', () => {
    expect(storageObjectPath('tenant-id/id-card.pdf', 'tenant-documents')).toBe(
      'tenant-id/id-card.pdf'
    )
  })

  it('migrates legacy public URLs without changing database rows', () => {
    const url =
      'https://project.supabase.co/storage/v1/object/public/tenant-documents/tenant%20id/card.pdf'
    expect(storageObjectPath(url, 'tenant-documents')).toBe('tenant id/card.pdf')
  })

  it('extracts paths from signed URLs and rejects unrelated URLs', () => {
    const signed =
      'https://project.supabase.co/storage/v1/object/sign/tenant-documents/contracts/a.pdf?token=x'
    expect(storageObjectPath(signed, 'tenant-documents')).toBe('contracts/a.pdf')
    expect(storageObjectPath('https://example.com/file.pdf', 'tenant-documents')).toBeNull()
  })
})
