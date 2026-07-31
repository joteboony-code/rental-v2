'use client'

import { useEffect, useLayoutEffect } from 'react'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useLayoutEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem('theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle(
        'dark',
        savedTheme === 'dark' || (savedTheme === null && prefersDark)
      )
    } catch {
      // The error screen must remain usable when browser storage is unavailable.
    }
  }, [])

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="th" suppressHydrationWarning>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <title>ระบบขัดข้องชั่วคราว</title>
        <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">ระบบขัดข้องชั่วคราว</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแลระบบ
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
        </main>
      </body>
    </html>
  )
}
