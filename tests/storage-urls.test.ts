import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSignedStorageUrls } from '@/lib/storage-urls'
import { MeterPhoto } from '@/components/meter-photo'

function client(sign: ReturnType<typeof vi.fn>) {
  const from = vi.fn(() => ({ createSignedUrls: sign }))
  return { client: { storage: { from } } as unknown as SupabaseClient, from }
}

describe('batch private storage signing', () => {
  it('signs 60 photos with one call using the supplied client and bucket', async () => {
    const paths = Array.from({ length: 60 }, (_, i) => `room/photo-${i}.jpg`)
    const sign = vi.fn(async (items: string[]) => ({ data: items.map(path => ({ path, signedUrl: `https://signed.example/${path}`, error: null })), error: null }))
    const s = client(sign)
    const result = await createSignedStorageUrls(s.client, 'meter-photos', paths, 3600)
    expect(sign).toHaveBeenCalledExactlyOnceWith(paths, 3600)
    expect(s.from).toHaveBeenCalledExactlyOnceWith('meter-photos')
    expect([...result.values()].filter(Boolean)).toHaveLength(60)
  })

  it('deduplicates legacy public URLs and paths and maps results by path, not response order', async () => {
    const old = 'https://example.supabase.co/storage/v1/object/public/meter-photos/a.jpg'
    const sign = vi.fn(async (paths: string[]) => ({ data: [
      { path: 'b.jpg', signedUrl: 'signed-b', error: null },
      { path: 'a.jpg', signedUrl: 'signed-a', error: null },
    ].filter(item => paths.includes(item.path)), error: null }))
    const result = await createSignedStorageUrls(client(sign).client, 'meter-photos', [old, 'a.jpg', 'b.jpg', null, '', 'https://other.example/no-match'])
    expect(sign.mock.calls[0][0]).toEqual(['a.jpg', 'b.jpg'])
    expect(result.get(old)).toBe('signed-a')
    expect(result.get('a.jpg')).toBe('signed-a')
    expect(result.get('b.jpg')).toBe('signed-b')
    expect(result.get('https://other.example/no-match')).toBeNull()
  })

  it('keeps missing or unauthorized results null without public fallback or individual retry', async () => {
    const sign = vi.fn(async () => ({ data: [{ path: 'a.jpg', signedUrl: 'must-not-use', error: 'Forbidden' }], error: null }))
    const result = await createSignedStorageUrls(client(sign).client, 'meter-photos', ['a.jpg', 'b.jpg'])
    expect([...result.values()]).toEqual([null, null])
    expect(sign).toHaveBeenCalledTimes(1)
  })

  it('handles network failure without exposing error secrets or fanning out retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const sign = vi.fn(async () => { throw new Error('secret-token') })
      const result = await createSignedStorageUrls(client(sign).client, 'meter-photos', ['a.jpg', 'b.jpg'])
      expect([...result.values()]).toEqual([null, null])
      expect(sign).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token')
    } finally { warn.mockRestore() }
  })

  it('does no request for empty input and uses bounded batches for larger lists', async () => {
    const sign = vi.fn(async (paths: string[]) => {
      expect(paths.length).toBeLessThanOrEqual(100)
      return { data: [], error: null }
    })
    const s = client(sign)
    await createSignedStorageUrls(s.client, 'meter-photos', [null, undefined, ''])
    expect(sign).not.toHaveBeenCalled()
    await createSignedStorageUrls(s.client, 'meter-photos', Array.from({ length: 201 }, (_, i) => `${i}.jpg`))
    expect(sign.mock.calls.map(call => (call[0] as string[]).length)).toEqual([100, 100, 1])
  })
})

describe('meter photo failure UI', () => {
  it('shows an explicit retry instead of a camera for an existing photo without a signed URL', () => {
    vi.stubGlobal('React', React)
    const html = renderToStaticMarkup(React.createElement(MeterPhoto, { src: null, storedValue: 'a.jpg', alt: 'มิเตอร์น้ำ ห้อง 12', className: 'block h-auto w-full' }))
    expect(html).toContain('โหลดรูปไม่สำเร็จ')
    expect(html).toContain('ลองใหม่')
    expect(html).not.toContain('เพิ่มรูปมิเตอร์')
  })
})
