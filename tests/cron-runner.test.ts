import { describe, expect, it, vi } from 'vitest'
import { runScheduledJobs } from '@/lib/cron-runner'

function setup(respond: (path: string) => Response | Promise<Response>) {
  const objects = new Map<string,string>()
  const fetch = vi.fn((req: Request) => Promise.resolve(respond(new URL(req.url).pathname)))
  return { objects, fetch, env: { CRON_SECRET: 'test-only', WORKER_SELF_REFERENCE: { fetch },
    BACKUP_BUCKET: { put: async (key: string, value: string) => { objects.set(key, value) } } } }
}
describe('scheduled job reporting', () => {
  it('records successful jobs without sending an alert', async () => {
    const { env, fetch, objects } = setup(() => Response.json({ ok: true }))
    await runScheduledJobs(env)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(JSON.parse(objects.get('rental-v2-state/cron/latest.json')!).results.every((r: {status: string}) => r.status === 'success')).toBe(true)
  })
  it.each(['http', 'body', 'partial', 'network'])('surfaces %s failure and completes unaffected jobs', async kind => {
    const { env, objects, fetch } = setup(path => {
      if (path.endsWith('/backup')) {
        if (kind === 'network') throw new Error('secret-provider-url-must-not-leak')
        if (kind === 'http') return Response.json({ ok: true }, { status: 500 })
        if (kind === 'body') return Response.json({ ok: false })
        return Response.json({ ok: true, failed: 1 })
      }
      return Response.json({ ok: true })
    })
    await expect(runScheduledJobs(env)).rejects.toThrow('backup')
    expect(fetch).toHaveBeenCalledTimes(5)
    const report = objects.get('rental-v2-state/cron/latest.json')!
    expect(report).not.toContain('secret-provider')
    expect(JSON.parse(report).results.filter((r: {status: string}) => r.status === 'success')).toHaveLength(3)
  })
})
