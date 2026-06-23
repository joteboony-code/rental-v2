'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import {
  Building2, LayoutDashboard, Home, Users, FileText, ClipboardList,
  Wrench, Settings, LogOut, History, Megaphone, Inbox, MoreHorizontal, X,
  BarChart2, Wallet,
} from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

const mainItems = [
  { href: '/home',    label: 'หน้าหลัก', icon: LayoutDashboard, match: (p: string) => p === '/home' },
  { href: '/rooms',   label: 'ห้องเช่า', icon: Home,            match: (p: string) => p.startsWith('/rooms') },
  { href: '/tenants', label: 'ผู้เช่า',  icon: Users,            match: (p: string) => p.startsWith('/tenants') || p.startsWith('/tenant-registrations') || p.startsWith('/leads') },
  { href: '/bills',   label: 'บิล',     icon: FileText,         match: (p: string) => p.startsWith('/bills') && !p.startsWith('/bills/meter') },
]

const moreItems = [
  { href: '/bills/meter',      label: 'จดมิเตอร์',       icon: ClipboardList, bg: 'bg-teal-50',    accent: 'text-teal-500',    match: (p: string) => p.startsWith('/bills/meter') },
  { href: '/repairs',          label: 'แจ้งซ่อม',        icon: Wrench,        bg: 'bg-amber-50',   accent: 'text-amber-500',   match: (p: string) => p.startsWith('/repairs') },
  { href: '/expenses',         label: 'ค่าใช้จ่าย',      icon: Wallet,        bg: 'bg-rose-50',    accent: 'text-rose-500',    match: (p: string) => p.startsWith('/expenses') },
  { href: '/reports',          label: 'รายงาน',          icon: BarChart2,     bg: 'bg-indigo-50',  accent: 'text-indigo-500',  match: (p: string) => p.startsWith('/reports') },
  { href: '/payment-reviews',  label: 'สลิปรอตรวจ',      icon: Inbox,         bg: 'bg-orange-50',  accent: 'text-orange-500',  match: (p: string) => p.startsWith('/payment-reviews') },
  { href: '/broadcast',        label: 'ประกาศ',          icon: Megaphone,     bg: 'bg-violet-50',  accent: 'text-violet-500',  match: (p: string) => p.startsWith('/broadcast') },
  { href: '/audit-logs',       label: 'ประวัติการกระทำ', icon: History,       bg: 'bg-rose-50',    accent: 'text-rose-500',    match: (p: string) => p.startsWith('/audit-logs') },
  { href: '/settings',         label: 'ตั้งค่า',          icon: Settings,      bg: 'bg-slate-100',  accent: 'text-slate-500',   match: (p: string) => p.startsWith('/settings') },
]

interface Props {
  displayName: string
  initials: string
  notifications?: Record<string, number>
}

function badgeText(count: number) {
  return count > 9 ? '9+' : String(count)
}

export function MobileBottomNav({ displayName, initials, notifications = {} }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const isMoreActive = moreItems.some((item) => item.match(pathname))
  const moreNotificationCount = moreItems.reduce((sum, item) => sum + (notifications[item.href] ?? 0), 0)

  return (
    <>
      {/* ── Top brand strip (mobile only) ── */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-100 bg-white px-4 md:hidden"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-slate-800 text-sm font-semibold tracking-tight">ห้องเช่า</span>
        </div>
        <ThemeToggle />
      </header>

      {/* ── Spacer — reserves space for the fixed bottom nav ── */}
      <div className="h-16 md:hidden shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />

      {/* ── Fixed bottom nav (mobile only) ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-slate-100 bg-white md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mainItems.map(({ href, label, icon: Icon, match }) => {
          const isActive = match(pathname)
          const notificationCount = notifications[href] ?? 0
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0"
              style={{ touchAction: 'manipulation' }}
            >
              <span className="relative flex items-center justify-center">
                <Icon className={`size-5 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} strokeWidth={isActive ? 2.25 : 1.75} />
                {notificationCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                    {badgeText(notificationCount)}
                  </span>
                )}
              </span>
              <span className={`text-[11px] font-medium truncate px-1 ${isActive ? 'text-slate-950' : 'text-slate-400'}`}>
                {label}
              </span>
            </Link>
          )
        })}

        {/* More button */}
        <button
          type="button"
          aria-label="เพิ่มเติม"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          style={{ touchAction: 'manipulation' }}
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0"
        >
          <span className="relative flex items-center justify-center">
            <MoreHorizontal className={`size-5 ${isMoreActive ? 'text-slate-950' : 'text-slate-400'}`} strokeWidth={isMoreActive ? 2.25 : 1.75} />
            {moreNotificationCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {badgeText(moreNotificationCount)}
              </span>
            )}
          </span>
          <span className={`text-[11px] font-medium truncate px-1 ${isMoreActive ? 'text-slate-950' : 'text-slate-400'}`}>
            เพิ่มเติม
          </span>
        </button>
      </nav>

      {/* ── "More" sheet backdrop + drawer ── */}
      {open && (
        <div
          className="fixed inset-0 md:hidden"
          style={{ zIndex: 300, background: 'rgba(15,23,42,0.45)' }}
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className="fixed inset-x-0 bottom-0 rounded-t-3xl bg-white shadow-2xl md:hidden flex flex-col max-h-[80vh]"
        style={{
          zIndex: 400,
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-900">เพิ่มเติม</p>
          <button
            type="button"
            aria-label="ปิด"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 active:bg-slate-100"
            style={{ touchAction: 'manipulation' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {moreItems.map(({ href, label, icon: Icon, bg, accent, match }) => {
            const isActive = match(pathname)
            const notificationCount = notifications[href] ?? 0
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-slate-950 text-white' : 'text-slate-600 active:bg-slate-100'
                }`}
              >
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${isActive ? 'bg-white/10' : bg}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : accent}`} strokeWidth={1.75} />
                </span>
                <span className="flex-1 truncate">{label}</span>
                {notificationCount > 0 && (
                  <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none ${
                    isActive ? 'bg-orange-400 text-white' : 'bg-orange-500 text-white'
                  }`}>
                    {badgeText(notificationCount)}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
            <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 text-xs font-bold text-slate-700">
              {initials}
            </div>
            <p className="text-sm text-slate-700 font-medium truncate flex-1">{displayName}</p>
            <form action={logout}>
              <button
                type="submit"
                className="p-2 rounded-lg text-slate-400 active:text-rose-500 active:bg-rose-50"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
