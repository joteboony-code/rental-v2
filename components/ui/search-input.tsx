import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        className={cn(
          'h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-3 focus-visible:ring-slate-100',
          className
        )}
        {...props}
      />
    </div>
  )
}
