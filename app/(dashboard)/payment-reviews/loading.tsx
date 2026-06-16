import { Skeleton } from '@/components/ui/skeleton'

export default function PaymentReviewsLoading() {
  return (
    <div className="p-5 md:p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-40" />
          </div>
        </div>
      </div>

      {/* Slip cards */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-start gap-4">
              <Skeleton className="size-16 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
