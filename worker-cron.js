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

    ctx.waitUntil(Promise.all([
      env.WORKER_SELF_REFERENCE.fetch(new Request('https://self/api/cron/reminders'), { headers }),
      env.WORKER_SELF_REFERENCE.fetch(new Request('https://self/api/cron/contracts'), { headers }),
      env.WORKER_SELF_REFERENCE.fetch(new Request('https://self/api/cron/daily-summary'), { headers }),
    ]))
  },
}

export default worker
