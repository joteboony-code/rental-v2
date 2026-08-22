'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addInterestGalleryPhotos, deleteInterestGalleryPhoto } from '@/app/actions/leads'
import { createClient } from '@/lib/supabase/client'
import { Check, ImagePlus, Images, Loader2, Trash2 } from 'lucide-react'

type GalleryImage = { path: string; url: string }

const BUCKET = 'interest-room-photos'
const MAX_PHOTOS = 10
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function compressGalleryImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const maxPx = 1600
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('ลดขนาดรูปไม่สำเร็จ')), 'image/jpeg', 0.84)
  })
  return new File([blob], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' })
}

export function InterestGalleryManager({ initial }: { initial: GalleryImage[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState(initial)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleFiles(files: FileList | null) {
    if (!files?.length || isPending) return
    setMessage(null)
    setSaved(false)

    const selected = Array.from(files)
    if (images.length + selected.length > MAX_PHOTOS) {
      setMessage(`เพิ่มรูปได้สูงสุด ${MAX_PHOTOS} รูป (ตอนนี้มี ${images.length} รูป)`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    const invalid = selected.find((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)
    if (invalid) {
      setMessage('รองรับ JPG, PNG, WebP และแต่ละรูปต้องไม่เกิน 5 MB')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        setMessage('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      const uploaded: GalleryImage[] = []
      try {
        for (const file of selected) {
          const compressed = await compressGalleryImage(file)
          const path = `${user.id}/${compressed.name}`
          const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
            contentType: 'image/jpeg',
            upsert: false,
          })
          if (error) throw error
          uploaded.push({ path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
        }

        const result = await addInterestGalleryPhotos(uploaded.map((image) => image.path))
        if (result.error) throw new Error(result.error)
        setImages((current) => [...current, ...uploaded])
        setSaved(true)
        router.refresh()
      } catch (error) {
        if (uploaded.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploaded.map((image) => image.path))
        }
        setMessage(error instanceof Error ? error.message : 'เพิ่มรูปไม่สำเร็จ กรุณาลองใหม่')
      } finally {
        if (inputRef.current) inputRef.current.value = ''
      }
    })
  }

  function handleDelete(image: GalleryImage) {
    setMessage(null)
    setSaved(false)
    startTransition(async () => {
      const result = await deleteInterestGalleryPhoto(image.path)
      if (result.error) {
        setMessage(result.error)
        return
      }
      setImages((current) => current.filter((item) => item.path !== image.path))
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-700">
            <Images className="size-3.5" /> รูปห้องพักบนหน้าฟอร์ม
          </p>
          <p className="mt-1 text-xs text-sky-600/70">ผู้สนใจจะเห็นรูปเหล่านี้ก่อนกรอกข้อมูล ({images.length}/{MAX_PHOTOS})</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending || images.length >= MAX_PHOTOS}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          เพิ่มรูป
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image, index) => (
            <div key={image.path} className="group relative aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-sky-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={`รูปห้องพัก ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => handleDelete(image)}
                disabled={isPending}
                className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-slate-950/70 text-white shadow transition hover:bg-rose-600 disabled:opacity-50"
                aria-label={`ลบรูปที่ ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-sky-200 bg-white/60 py-8 text-sky-500 transition hover:bg-white disabled:opacity-50"
        >
          <ImagePlus className="size-6" />
          <span className="text-xs font-semibold">เพิ่มรูปภายในห้องหรือบริเวณหอพัก</span>
        </button>
      )}

      {message && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{message}</p>}
      {saved && (
        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <Check className="size-3.5" /> บันทึกแล้ว
        </p>
      )}
      <p className="text-[11px] text-sky-600/60">เลือกได้หลายรูป รองรับ JPG, PNG, WebP รูปละไม่เกิน 5 MB</p>
    </section>
  )
}
