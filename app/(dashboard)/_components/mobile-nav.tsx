'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { Building2, LayoutDashboard, Home, Users, FileText, ClipboardList, Wrench, Settings, Menu, X, LogOut, History, Megaphone, Inbox } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'

const navItems = [
  {
    href:    '/',
    label:   'แดชบอร์ด',
    icon:    LayoutDashboard,
    accent:  'text-slate-600',
    bg:      'bg-slate-100',
    match:   (p: string) => p === '/',
  },
  {
    href:    '/rooms',
    label:   'ห้องเช่า',
    icon:    Home,
    accent:  'text-sky-500',
    bg:      'bg-sky-50',
    match:   (p: string) => p.startsWith('/rooms'),
  },
  {
    href:    '/tenants',
    label:   'ผู้เช่า',
    icon:    Users,
    accent:  'text-violet-500',
    bg:      'bg-violet-50',
    match:   (p: string) => p.startsWith('/tenants'),
  },
  {
    href:    '/bills',
    label:   'บิล/ชำระเงิน',
    icon:    FileText,
    accent:  'text-emerald-500',
    bg:      'bg-emerald-50',
    match:   (p: string) => p.startsWith('/bills') && !p.startsWith('/bills/meter'),
  },
  {
    href:    '/bills/meter',
    label:   'จดมิเตอร์',
    icon:    ClipboardList,
    accent:  'text-teal-500',
    bg:      'bg-teal-50',
    match:   (p: string) => p.startsWith('/bills/meter'),
  },
  {
    href:    '/repairs',
    label:   'แจ้งซ่อม',
    icon:    Wrench,
    accent:  'text-amber-500',
    bg:      'bg-amber-50',
    match:   (p: string) => p.startsWith('/repairs'),
  },
  {
    href:    '/payment-reviews',
    label:   'สลิปรอตรวจ',
    icon:    Inbox,
    accent:  'text-orange-500',
    bg:      'bg-orange-50',
    match:   (p: string) => p.startsWith('/payment-reviews'),
  },
  {
    href:    '/broadcast',
    label:   'ประกาศ',
    icon:    Megaphone,
    accent:  'text-violet-500',
    bg:      'bg-violet-50',
    match:   (p: string) => p.startsWith('/broadcast'),
  },
  {
    href:    '/audit-logs',
    label:   'ประวัติการกระทำ',
    icon:    History,
    accent:  'text-rose-500',
    bg:      'bg-rose-50',
    match:   (p: string) => p.startsWith('/audit-logs'),
  },
  {
    href:    '/settings',
    label:   'ตั้งค่า',
    icon:    Settings,
    accent:  'text-slate-500',
    bg:      'bg-slate-100',
    match:   (p: string) => p.startsWith('/settings'),
  },
]

interface Props {
  displayName: string
  initials:    string
  notifications?: Record<string, number>
}

function badgeText(count: number) {
  return count > 9 ? '9+' : String(count)
}

export function MobileNav({ displayName, initials, notifications = {} }: Props) {
  const pathname  = usePathname()
  const [open, setOpen] = useState(false)

  // Lock body scroll when drawer open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const activeItem = navItems.find(n => n.match(pathname))
  const activeNotificationCount = activeItem ? notifications[activeItem.href] ?? 0 : 0

  return (
    <>
      {/* ── Spacer — reserves space for the fixed top bar ── */}
      <div className="h-14 md:hidden shrink-0" />

      {/* ── Fixed top bar (mobile only) ── */}
      <header
        className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-100 flex items-center gap-3 px-4 md:hidden"
        style={{ zIndex: 200 }}
      >
        {/* Hamburger */}
        <button
          type="button"
          aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={open}
          aria-controls="admin-mobile-drawer"
          style={{ touchAction: 'manipulation' }}
          onClick={() => setOpen((current) => !current)}
          className="flex items-center justify-center size-11 -ml-2 rounded-2xl bg-slate-50 text-slate-700 shadow-sm shadow-slate-200/60 active:bg-slate-100"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-slate-950 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-slate-800 text-sm font-semibold tracking-tight">ห้องเช่า</span>
        </div>

        {/* Current page chip */}
        {activeItem && (
          <span className={`relative text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${activeItem.bg} ${activeItem.accent}`}>
            {activeItem.label}
            {activeNotificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {badgeText(activeNotificationCount)}
              </span>
            )}
          </span>
        )}
        <ThemeToggle />
      </header>

      {/* ── Backdrop (only when open) ── */}
      {open && (
        <div
          className="fixed inset-0 md:hidden"
          style={{ zIndex: 300, background: 'rgba(15,23,42,0.45)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Drawer ── */}
      <div
        id="admin-mobile-drawer"
        className="fixed inset-y-0 left-0 w-72 bg-white flex flex-col shadow-2xl md:hidden"
        style={{
          zIndex:    400,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-slate-950 flex items-center justify-center shadow-md shadow-slate-900/20">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm tracking-tight">ห้องเช่า</p>
            <p className="text-xs text-slate-400">Admin Portal</p>
          </div>
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 active:bg-slate-100"
            style={{ touchAction: 'manipulation' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, accent, bg, match }) => {
            const isActive = match(pathname)
            const notificationCount = notifications[href] ?? 0
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 active:bg-slate-100'
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
        </nav>

        {/* User + logout */}
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

