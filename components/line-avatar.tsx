'use client'

import { useState } from 'react'

type LineAvatarProps = {
  name: string
  pictureUrl?: string | null
  className?: string
  fallbackClassName?: string
}

export function LineAvatar({
  name,
  pictureUrl,
  className = 'size-9 rounded-xl text-xs',
  fallbackClassName = '',
}: LineAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const initials = name.trim().slice(0, 2).toUpperCase() || '—'
  const canShowImage = Boolean(pictureUrl) && !imageFailed

  if (canShowImage) {
    return (
      <img
        src={pictureUrl ?? undefined}
        alt={`รูป LINE ของ ${name}`}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setImageFailed(true)}
        className={`${className} object-cover ring-1 ring-white/70 shadow-sm shrink-0`}
      />
    )
  }

  return (
    <span
      className={`${className} ${fallbackClassName} bg-slate-100 flex items-center justify-center font-bold text-slate-600 shrink-0`}
      title={pictureUrl && imageFailed ? 'โหลดรูป LINE ไม่สำเร็จ' : undefined}
    >
      {initials}
    </span>
  )
}
