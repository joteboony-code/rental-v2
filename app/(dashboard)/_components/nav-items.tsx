'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, FileText, ClipboardList, Wrench, Settings, History, Megaphone, LayoutDashboard } from 'lucide-react'

const navItems = [
  {
    href:     '/',
    label:    'หน้าหลัก',
    icon:     LayoutDashboard,
    dot:      'bg-slate-400',
    match:    (p: string) => p === '/',
  },
  {
    href:     '/rooms',
    label:    'ห้องเช่า',
    icon:     Home,
    dot:      'bg-sky-400',
    match:    (p: string) => p.startsWith('/rooms'),
  },
  {
    href:     '/tenants',
    label:    'ผู้เช่า',
    icon:     Users,
    dot:      'bg-violet-400',
    match:    (p: string) => p.startsWith('/tenants'),
  },
  {
    href:     '/bills',
    label:    'บิล/ชำระเงิน',
    icon:     FileText,
    dot:      'bg-emerald-400',
    match:    (p: string) => p.startsWith('/bills') && !p.startsWith('/bills/meter'),
  },
  {
    href:     '/bills/meter',
    label:    'จดมิเตอร์',
    icon:     ClipboardList,
    dot:      'bg-teal-400',
    match:    (p: string) => p.startsWith('/bills/meter'),
  },
  {
    href:     '/repairs',
    label:    'แจ้งซ่อม',
    icon:     Wrench,
    dot:      'bg-amber-400',
    match:    (p: string) => p.startsWith('/repairs'),
  },
  {
    href:     '/broadcast',
    label:    'ประกาศ',
    icon:     Megaphone,
    dot:      'bg-violet-400',
    match:    (p: string) => p.startsWith('/broadcast'),
  },
  {
    href:     '/history',
    label:    'ประวัติ',
    icon:     History,
    dot:      'bg-rose-400',
    match:    (p: string) => p.startsWith('/history'),
  },
  {
    href:     '/settings',
    label:    'ตั้งค่า',
    icon:     Settings,
    dot:      'bg-slate-400',
    match:    (p: string) => p.startsWith('/settings'),
  },
]

export function NavItems() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col items-center gap-1 flex-1 py-2">
      {navItems.map(({ href, label, icon: Icon, dot, match }) => {
        const isActive = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`sidebar-item group relative flex items-center justify-center size-11 rounded-xl transition-all duration-150 ${
              isActive
                ? 'bg-slate-950 text-white shadow-md shadow-slate-900/20'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Icon className="size-[18px]" strokeWidth={isActive ? 2 : 1.75} />

            {/* Active dot */}
            {isActive && (
              <span className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ${dot} ring-2 ring-white`} />
            )}

            {/* Tooltip */}
            <span className="sidebar-tooltip absolute left-[calc(100%+10px)] z-50 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 text-white text-xs font-medium rounded-lg shadow-xl">
              <span className={`size-1.5 rounded-full ${dot}`} />
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}


