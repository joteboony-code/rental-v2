import { Skeleton } from '@/components/ui/skeleton'

export default function AuditLogsLoading() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      {/* Filter bar */}
      <Skeleton className="h-12 w-full rounded-2xl" />

      {/* Log rows */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
            <Skeleton className="h-6 w-24 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
