import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-6xl">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-0.5 w-full" />
          </div>
        ))}
      </div>
      <div className="bg-slate-200 rounded-2xl p-5 md:p-6 space-y-3">
        <Skeleton className="h-4 w-24 bg-slate-300" />
        <Skeleton className="h-10 w-48 bg-slate-300" />
        <Skeleton className="h-1.5 w-full bg-slate-300" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <Skeleton className="h-10 w-10 mx-auto rounded-xl" />
            <Skeleton className="h-4 w-16 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
