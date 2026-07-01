import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">404</p>
        <h1 className="mt-2 text-xl font-bold text-slate-950">ไม่พบหน้าที่ต้องการ</h1>
        <p className="mt-2 text-sm text-slate-500">
          ลิงก์อาจไม่ถูกต้อง หมดอายุ หรือคุณไม่มีสิทธิ์เข้าถึง
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          กลับหน้าหลัก
        </Link>
      </div>
    </main>
  )
}
