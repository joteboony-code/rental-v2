'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, FileText, ClipboardList, Wrench, Settings, History, Megaphone, LayoutDashboard, Inbox, BarChart2, Wallet } from 'lucide-react'

const navItems = [
  {
    href:   '/home',
    label:  'หน้าหลัก',
    icon:   LayoutDashboard,
    dot:    'bg-slate-400',
    match:  (p: string) => p === '/home',
  },
  {
    href:   '/rooms',
    label:  'ห้องเช่า',
    icon:   Home,
    dot:    'bg-sky-400',
    match:  (p: string) => p.startsWith('/rooms'),
  },
  {
    href:  '/tenants',
    label: 'ผู้เช่า',
    icon:  Users,
    dot:   'bg-violet-400',
    match: (p: string) => p.startsWith('/tenants') || p.startsWith('/tenant-registrations') || p.startsWith('/leads'),
  },
  {
    href:   '/bills',
    label:  'บิล/ชำระเงิน',
    icon:   FileText,
    dot:    'bg-emerald-400',
    match:  (p: string) => p.startsWith('/bills') && !p.startsWith('/bills/meter'),
  },
  {
    href:   '/bills/meter',
    label:  'จดมิเตอร์',
    icon:   ClipboardList,
    dot:    'bg-teal-400',
    match:  (p: string) => p.startsWith('/bills/meter'),
  },
  {
    href:   '/repairs',
    label:  'แจ้งซ่อม',
    icon:   Wrench,
    dot:    'bg-amber-400',
    match:  (p: string) => p.startsWith('/repairs'),
  },
  {
    href:   '/expenses',
    label:  'ค่าใช้จ่าย',
    icon:   Wallet,
    dot:    'bg-rose-400',
    match:  (p: string) => p.startsWith('/expenses'),
  },
  {
    href:   '/payment-reviews',
    label:  'สลิปรอตรวจ',
    icon:   Inbox,
    dot:    'bg-orange-400',
    match:  (p: string) => p.startsWith('/payment-reviews'),
  },
  {
    href:   '/broadcast',
    label:  'ประกาศ',
    icon:   Megaphone,
    dot:    'bg-violet-400',
    match:  (p: string) => p.startsWith('/broadcast'),
  },
  {
    href:   '/reports',
    label:  'รายงาน',
    icon:   BarChart2,
    dot:    'bg-indigo-400',
    match:  (p: string) => p.startsWith('/reports'),
  },
  {
    href:   '/audit-logs',
    label:  'ประวัติการกระทำ',
    icon:   History,
    dot:    'bg-rose-400',
    match:  (p: string) => p.startsWith('/audit-logs'),
  },
  {
    href:   '/settings',
    label:  'ตั้งค่า',
    icon:   Settings,
    dot:    'bg-slate-400',
    match:  (p: string) => p.startsWith('/settings'),
  },
]

type Notifications = Record<string, number>

function badgeText(count: number) {
  return count > 9 ? '9+' : String(count)
}

export function NavItems({ notifications = {} }: { notifications?: Notifications }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col items-center gap-0.5 flex-1 py-1">
      {navItems.map(({ href, label, icon: Icon, dot, match }) => {
        const isActive = match(pathname)
        const notificationCount = notifications[href] ?? 0
        const hasNotification = notificationCount > 0
        return (
          <Link
            key={href}
            href={href}
            aria-label={hasNotification ? `${label} (${notificationCount})` : label}
            className={`sidebar-item group relative flex items-center justify-center size-10 rounded-xl transition-all duration-150 ${
              isActive
                ? 'bg-slate-950 text-white shadow-md shadow-slate-900/20'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Icon className="size-[18px]" strokeWidth={isActive ? 2 : 1.75} />

            {isActive && !hasNotification && (
              <span className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ${dot} ring-2 ring-white`} />
            )}

            {hasNotification && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {badgeText(notificationCount)}
              </span>
            )}

            <span className="sidebar-tooltip absolute left-[calc(100%+10px)] z-50 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 text-white text-xs font-medium rounded-lg shadow-xl">
              <span className={`size-1.5 rounded-full ${dot}`} />
              {label}
              {hasNotification && (
                <span className="ml-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {notificationCount}
                </span>
              )}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

