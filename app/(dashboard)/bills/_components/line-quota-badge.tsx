import { getLineQuota } from '@/app/actions/line-quota'
import { MessageCircle } from 'lucide-react'

export async function LineQuotaBadge() {
  const quota = await getLineQuota()
  if (!quota) return null

  const isUnlimited = quota.type === 'unlimited'
  const pct = isUnlimited ? 100 : Math.round((quota.used / quota.limit) * 100)
  const low = !isUnlimited && quota.remaining < 50

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border ${
      low
        ? 'bg-rose-50 border-rose-100 text-rose-700'
        : 'bg-white border-slate-100 text-slate-500'
    }`}>
      <MessageCircle className={`size-3.5 ${low ? 'text-rose-500' : 'text-green-500'}`} />
      <span>
        LINE OA:{' '}
        {isUnlimited ? (
          <span className="font-semibold text-emerald-600">Unlimited</span>
        ) : (
          <>
            <span className={`font-semibold ${low ? 'text-rose-700' : 'text-slate-700'}`}>
              {quota.used.toLocaleString()}
            </span>
            <span className="text-slate-400">/{quota.limit.toLocaleString()}</span>
            {low && (
              <span className="ml-1 font-semibold text-rose-600">
                (เหลือ {quota.remaining})
              </span>
            )}
          </>
        )}
      </span>
      {!isUnlimited && (
        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${low ? 'bg-rose-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
