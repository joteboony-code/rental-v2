'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="th">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">ระบบขัดข้องชั่วคราว</h1>
          <p className="mt-2 text-sm text-slate-500">
            กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาโปรดติดต่อผู้ดูแลระบบ
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  )
}
