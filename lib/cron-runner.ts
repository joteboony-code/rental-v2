export const CRON_JOBS = ['reminders', 'contracts', 'daily-summary', 'backup'] as const
export type CronJob = typeof CRON_JOBS[number]
export type CronResult = { job: CronJob; status: 'running' | 'success' | 'failed'; startedAt: string; completedAt: string | null; httpStatus?: number; reason?: string }
export type CronReport = { startedAt: string; completedAt: string | null; results: CronResult[]; alertFailed?: boolean }
type CronEnv = {
  CRON_SECRET?: string
  WORKER_SELF_REFERENCE: { fetch(request: Request): Promise<Response> }
  BACKUP_BUCKET: { put(key: string, value: string): Promise<unknown> }
}

export async function runScheduledJobs(env: CronEnv): Promise<void> {
  if (!env.CRON_SECRET || !env.WORKER_SELF_REFERENCE || !env.BACKUP_BUCKET) {
    console.error(JSON.stringify({ event: 'cron_configuration_missing' }))
    throw new Error('Cron bindings or secret missing')
  }
  const startedAt = new Date().toISOString()
  const report: CronReport = { startedAt, completedAt: null, results: CRON_JOBS.map(job => ({ job, status: 'running', startedAt, completedAt: null })) }
  const latestKey = 'rental-v2-state/cron/latest.json'
  await env.BACKUP_BUCKET.put(latestKey, JSON.stringify(report))
  report.results = await Promise.all(CRON_JOBS.map(async job => {
    const result: CronResult = { job, status: 'failed', startedAt, completedAt: null }
    try {
      const response = await env.WORKER_SELF_REFERENCE.fetch(new Request(`https://self/api/cron/${job}`, {
        headers: { 'x-cron-secret': env.CRON_SECRET! }, signal: AbortSignal.timeout(12 * 60_000),
      }))
      result.httpStatus = response.status
      const body: unknown = await response.json()
      const valid = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true
      const partialFailure = body !== null && typeof body === 'object' && 'failed' in body && Number(body.failed) > 0
      if (!response.ok || !valid || partialFailure) {
        result.reason = partialFailure ? 'partial_delivery_failure' : `job_response_failure_${response.status}`
      } else result.status = 'success'
    } catch {
      // Do not persist response bodies, tokens, user details or provider URLs.
      result.reason = 'network_timeout_or_invalid_response'
    }
    result.completedAt = new Date().toISOString()
    console[result.status === 'success' ? 'info' : 'error'](JSON.stringify({ event: 'cron_job_completed', ...result }))
    try {
      await env.BACKUP_BUCKET.put(`rental-v2-state/cron/jobs/${job}.json`, JSON.stringify(result))
    } catch {
      result.status = 'failed'
      result.reason = 'status_storage_failed'
    }
    return result
  }))
  report.completedAt = new Date().toISOString()
  const failed = report.results.filter(result => result.status === 'failed').map(result => result.job)
  if (failed.length) {
    try {
      const alert = await env.WORKER_SELF_REFERENCE.fetch(new Request('https://self/api/cron/health-alert', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': env.CRON_SECRET },
        body: JSON.stringify({ failed }), signal: AbortSignal.timeout(30_000),
      }))
      if (!alert.ok) throw new Error('Alert failed')
    } catch { report.alertFailed = true }
  }
  await env.BACKUP_BUCKET.put(latestKey, JSON.stringify(report))
  await env.BACKUP_BUCKET.put(`rental-v2-state/cron/history/${startedAt.replace(/[:.]/g, '-')}.json`, JSON.stringify(report))
  // No blind retry of notifications: a provider timeout might have delivered.
  if (failed.length) throw new Error(`Scheduled jobs failed: ${failed.join(', ')}`)
}
