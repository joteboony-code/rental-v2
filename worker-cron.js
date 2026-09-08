// Cloudflare Worker entry point with Cron Trigger support.
// Delegates all fetch requests to the OpenNext-generated worker,
// and adds a scheduled handler that fires all cron endpoints daily.
export * from './.open-next/worker.js'
import openNextWorker from './.open-next/worker.js'
import { runScheduledJobs } from './lib/cron-runner.ts'

const worker = {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx)
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledJobs(env))
  },
}

export default worker
