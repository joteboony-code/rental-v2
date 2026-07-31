'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-bold text-slate-950 dark:text-white">
          ระบบขัดข้องชั่วคราว
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          ข้อมูลที่บันทึกสำเร็จแล้วจะไม่หาย กรุณาลองโหลดหน้านี้ใหม่อีกครั้ง
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            รหัสอ้างอิง: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={unstable_retry}
          className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          ลองใหม่
        </button>
      </section>
    </main>
  )
}
