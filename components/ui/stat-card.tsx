import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Tone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose'

const toneIconClass: Record<Tone, string> = {
  slate:   'bg-slate-100 text-slate-600',
  blue:    'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber:   'bg-amber-50 text-amber-600',
  rose:    'bg-rose-50 text-rose-600',
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  tone?: Tone
  hint?: string
  className?: string
}

export function StatCard({ label, value, icon: Icon, tone = 'slate', hint, className }: StatCardProps) {
  return (
    <Card className={cn('rounded-2xl p-4 gap-2', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cn('flex size-8 items-center justify-center rounded-xl', toneIconClass[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-900 leading-tight">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </Card>
  )
}
