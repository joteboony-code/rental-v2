import { Skeleton } from '@/components/ui/skeleton'

export default function RoomsLoading() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 md:p-5 space-y-2 md:space-y-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-9 w-10" />
            <Skeleton className="h-0.5 w-full" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 last:border-0">
            <Skeleton className="size-9 shrink-0" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32 ml-auto" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
