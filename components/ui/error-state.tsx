import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({ title = 'เกิดข้อผิดพลาด', description, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-500">
        <AlertTriangle className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-rose-700">{title}</p>
        {description && <p className="text-xs text-rose-500">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="rounded-xl">
          ลองอีกครั้ง
        </Button>
      )}
    </div>
  )
}
