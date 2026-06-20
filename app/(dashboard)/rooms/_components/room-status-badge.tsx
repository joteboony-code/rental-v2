import { StatusBadge } from '@/components/ui/status-badge'
import { roomStatusVisual, fallbackVisual } from '@/lib/status'

export function RoomStatusBadge({ status }: { status: string }) {
  const visual = roomStatusVisual[status] ?? fallbackVisual(status)
  return <StatusBadge {...visual} />
}
