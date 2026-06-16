import { Loader2 } from 'lucide-react'

export function LoadingState({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-12 text-center">
      <Loader2 className="size-6 animate-spin text-slate-400" />
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  )
}
