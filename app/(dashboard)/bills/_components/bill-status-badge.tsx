import type { BillStatus } from '@/lib/definitions'
import { StatusBadge } from '@/components/ui/status-badge'
import { billStatusVisual, fallbackVisual } from '@/lib/status'

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const visual = billStatusVisual[status] ?? fallbackVisual(status)
  return <StatusBadge {...visual} />
}
