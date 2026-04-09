import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../lib/auth.js'
import { startScheduler, runNow } from '../services/scheduler.js'
import { startCleanupJob, runCleanupNow, getCleanupJobStatus } from '../services/cleanupJob.js'

export async function schedulerRoutes(app: FastifyInstance) {
  // POST /api/scheduler/run — trigger an immediate check
  app.post('/run', { preHandler: [requireAuth] }, async (req, reply) => {
    runNow().catch(() => {}) // fire and forget, errors are logged
    return reply.send({ started: true })
  })

  // POST /api/scheduler/restart — re-read interval from DB and restart cron
  app.post('/restart', { preHandler: [requireAuth] }, async (req, reply) => {
    await startScheduler()
    return reply.send({ restarted: true })
  })

  // GET /api/scheduler/cleanup — get cleanup job status
  app.get('/cleanup', { preHandler: [requireAuth] }, async (_req, reply) => {
    return reply.send(getCleanupJobStatus())
  })

  // POST /api/scheduler/cleanup/run — trigger immediate cleanup
  app.post('/cleanup/run', { preHandler: [requireAuth] }, async (_req, reply) => {
    const result = await runCleanupNow()
    return reply.send(result)
  })

  // POST /api/scheduler/cleanup/restart — re-read settings and restart cleanup cron
  app.post('/cleanup/restart', { preHandler: [requireAuth] }, async (_req, reply) => {
    await startCleanupJob()
    return reply.send({ restarted: true })
  })
}
