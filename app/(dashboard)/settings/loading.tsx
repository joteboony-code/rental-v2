import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Link card */}
      <Skeleton className="h-16 w-full rounded-2xl" />

      {/* Section cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="px-5 py-5 space-y-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
