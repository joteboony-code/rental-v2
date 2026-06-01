import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/actions/auth'
import { NavItems } from './_components/nav-items'
import { MobileNav } from './_components/mobile-nav'
import { GlobalSearch } from './_components/global-search'
import { ThemeToggle } from './_components/theme-toggle'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const displayName = user.email ?? 'เจ้าของ'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col border-r border-slate-100 bg-white md:flex">
        <div className="px-3 py-3 border-b border-slate-100 text-center">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest leading-tight">ระบบจัดการ</p>
          <h1 className="text-sm font-bold text-slate-900 mt-0.5">ห้องเช่า</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <NavItems />
        </nav>

        {/* User + logout */}
        <div className="border-t border-slate-100 py-2 flex flex-col items-center gap-0.5">
          <ThemeToggle />
          {/* Avatar */}
          <div className="sidebar-item group relative flex items-center justify-center size-10 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
            {initials}
            <span className="sidebar-tooltip absolute left-[calc(100%+10px)] z-50 px-2.5 py-1.5 bg-slate-950 text-white text-xs font-medium rounded-lg shadow-xl">
              {displayName}
            </span>
          </div>
          {/* Logout */}
          <form action={logout}>
            <button
              type="submit"
              className="sidebar-item group relative flex items-center justify-center size-10 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-150"
            >
              <LogOut className="size-[18px]" strokeWidth={1.75} />
              <span className="sidebar-tooltip absolute left-[calc(100%+10px)] z-50 px-2.5 py-1.5 bg-slate-950 text-white text-xs font-medium rounded-lg shadow-xl">
                ออกจากระบบ
              </span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-16">
        <div className="hidden md:flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-2">
          <GlobalSearch />
        </div>
        <MobileNav displayName={displayName} initials={initials} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
