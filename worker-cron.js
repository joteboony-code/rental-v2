// Cloudflare Worker entry point with Cron Trigger support.
// Delegates all fetch requests to the OpenNext-generated worker,
// and adds a scheduled handler that fires all cron endpoints daily.
export * from './.open-next/worker.js'
import openNextWorker from './.open-next/worker.js'

const worker = {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx)
  },

  async scheduled(event, env, ctx) {
    const secret = env.CRON_SECRET ?? ''
    const headers = secret ? { 'x-cron-secret': secret } : {}
    const cronPaths = [
      '/api/cron/reminders',
      '/api/cron/contracts',
      '/api/cron/daily-summary',
      '/api/cron/backup',
    ]

    ctx.waitUntil(Promise.allSettled(
      cronPaths.map((path) =>
        env.WORKER_SELF_REFERENCE.fetch(new Request(`https://self${path}`), { headers })
      )
    ))
  },
}

export default worker
