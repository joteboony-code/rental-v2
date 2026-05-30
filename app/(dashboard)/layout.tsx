import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NavItems } from './_components/nav-items'
import { MobileNav } from './_components/mobile-nav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const displayName = user.email ?? 'เจ้าของ'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-16 flex-col border-r border-slate-100 bg-white">
        <div className="px-5 py-5 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">ระบบจัดการ</p>
          <h1 className="text-base font-bold text-slate-900 mt-0.5">ห้องเช่า</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          <NavItems />
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav displayName={displayName} initials={initials} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
