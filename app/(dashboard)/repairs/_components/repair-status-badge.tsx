import type { RepairStatus, RepairPriority } from '@/lib/definitions'
import { StatusBadge } from '@/components/ui/status-badge'
import { repairStatusVisual, repairPriorityVisual, fallbackVisual } from '@/lib/status'

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  const visual = repairStatusVisual[status] ?? fallbackVisual(status)
  return <StatusBadge {...visual} />
}

export function RepairPriorityBadge({ priority }: { priority: RepairPriority }) {
  const visual = repairPriorityVisual[priority] ?? fallbackVisual(priority)
  return <StatusBadge {...visual} />
}
