'use server'

import { getLineMessagingConfig } from '@/lib/line-integration'
import { getAuthedUser } from '@/lib/require-admin'

export interface LineQuota {
  type:      'limited' | 'unlimited'
  limit:     number
  used:      number
  remaining: number
}

export async function getLineQuota(): Promise<LineQuota | null> {
  if (!(await getAuthedUser())) return null
  const config = await getLineMessagingConfig()
  if (!config) return null
  const token = config.channelAccessToken

  try {
    const [quotaRes, consumptionRes] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])

    if (!quotaRes.ok || !consumptionRes.ok) return null

    const quota = await quotaRes.json() as { type: string; value?: number }
    const consumption = await consumptionRes.json() as { totalUsage: number }

    if (quota.type === 'unlimited') {
      return { type: 'unlimited', limit: 0, used: consumption.totalUsage, remaining: Infinity }
    }

    const limit = quota.value ?? 0
    const used  = consumption.totalUsage ?? 0
    return { type: 'limited', limit, used, remaining: Math.max(0, limit - used) }
  } catch {
    return null
  }
}
