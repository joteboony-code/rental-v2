import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const send = vi.hoisted(() => vi.fn(async () => 'accepted'))
vi.mock('@/lib/reminder-delivery', () => ({ sendTrackedReminder: send }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/line-integration', () => ({ getLineMessagingConfig: async () => ({ channelAccessToken: 'test' }) }))
import { POST } from '@/app/api/cron/reminders/delivery/route'
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
describe('internal reminder delivery authorization', () => {
  it('denies anonymous calls without sending', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-test')
    const res = await POST(new NextRequest('https://self/api/cron/reminders/delivery', {method:'POST'}))
    expect(res.status).toBe(401); expect(send).not.toHaveBeenCalled()
  })
  it('rejects mismatched recipient identity', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-test')
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    const res = await POST(new NextRequest('https://self/api/cron/reminders/delivery', {
      method:'POST',headers:{'x-cron-secret':'secret-test','Content-Type':'application/json'},
      body:JSON.stringify({row:{reminder_date:date,recipient_key:'one',rooms:['1'],bill_ids:[],amount:100},to:'two',messages:[{type:'text',text:'test'}]}),
    }))
    expect(res.status).toBe(400); expect(send).not.toHaveBeenCalled()
  })
})
