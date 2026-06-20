import { toneClass, toneDotClass, type StatusVisual } from '@/lib/status'

export function StatusBadge({ label, tone, pulse }: StatusVisual) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${toneClass(tone)}`}>
      <span className="relative flex size-1.5">
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${toneDotClass(tone)} opacity-60`} />
        )}
        <span className={`relative inline-flex size-1.5 rounded-full ${toneDotClass(tone)}`} />
      </span>
      {label}
    </span>
  )
}
