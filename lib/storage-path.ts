export function storageObjectPath(value: string | null | undefined, bucket: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, '')
  }

  try {
    const pathname = new URL(trimmed).pathname
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
      `/${bucket}/`,
    ]
    for (const marker of markers) {
      const index = pathname.indexOf(marker)
      if (index >= 0) return decodeURIComponent(pathname.slice(index + marker.length))
    }
  } catch {
    return null
  }

  return null
}
