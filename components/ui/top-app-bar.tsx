import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopAppBarProps {
  title: string
  backHref?: string
  actions?: React.ReactNode
  className?: string
}

export function TopAppBar({ title, backHref, actions, className }: TopAppBarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-100 bg-white/95 px-4 backdrop-blur-sm md:hidden',
        className
      )}
    >
      {backHref && (
        <Link
          href={backHref}
          aria-label="ย้อนกลับ"
          className="flex size-9 -ml-1 shrink-0 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100"
        >
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <h1 className="flex-1 truncate text-base font-semibold text-slate-900">{title}</h1>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}
