'use client'

import Image from 'next/image'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { storageObjectPath } from '@/lib/storage-path'

/** Key the inner component by its source so a replaced photo cannot inherit a stale retry. */
export function MeterPhoto(props: { src?: string | null; storedValue?: string | null; alt: string; className: string; linked?: boolean }) {
  return <MeterPhotoSource key={`${props.storedValue ?? ''}|${props.src ?? ''}`} {...props} />
}

function MeterPhotoSource({ src, storedValue, alt, className, linked }: Parameters<typeof MeterPhoto>[0]) {
  const [url, setUrl] = useState(src ?? null)
  const [failed, setFailed] = useState(!src)
  const [loading, setLoading] = useState(false)

  async function retry() {
    if (loading) return
    setLoading(true)
    try {
      const path = storageObjectPath(storedValue ?? src, 'meter-photos')
      if (!path) throw new Error('No stored photo')
      // Browser session + Storage RLS; never use a service key or a public URL fallback.
      const { data, error } = await createClient().storage.from('meter-photos').createSignedUrl(path, 3600)
      if (error || !data?.signedUrl) throw new Error('Signing failed')
      setUrl(data.signedUrl)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (failed || !url) return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-center text-xs text-amber-700" role="status">
      <p>โหลดรูปไม่สำเร็จ</p>
      <button type="button" disabled={loading} onClick={retry} className="mt-1 rounded border border-amber-300 px-2 py-1 font-semibold disabled:opacity-50" aria-label={`ลองโหลดใหม่: ${alt}`}>
        {loading ? 'กำลังโหลด…' : 'ลองใหม่'}
      </button>
    </div>
  )
  const photo = <Image src={url} alt={alt} width={1200} height={1600} unoptimized className={className} onError={() => setFailed(true)} />
  return linked ? <a href={url} target="_blank" rel="noreferrer">{photo}</a> : photo
}
