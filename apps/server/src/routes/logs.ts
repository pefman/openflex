import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../lib/auth.js'
import { log, getLogs, getErrorCount, clearLogs } from '../lib/logger.js'

export async function logRoutes(app: FastifyInstance) {
  // GET /api/logs?limit=200
  app.get<{ Querystring: { limit?: string } }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const limit = Math.min(Number(req.query.limit ?? 200), 500)
    return reply.send(getLogs(limit))
  })

  // GET /api/logs/error-count
  app.get('/error-count', { preHandler: [requireAuth] }, async (_req, reply) => {
    return reply.send({ count: getErrorCount() })
  })

  // POST /api/logs — write a client-side log entry (e.g. player events)
  app.post<{ Body: { level: string; source: string; message: string } }>(
    '/',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { level, source, message } = req.body
      const safeLevel = level === 'warn' || level === 'error' ? level : 'info'
      const safeSource = String(source).slice(0, 32).replace(/[^a-z0-9_-]/gi, '')
      log(safeLevel, safeSource, String(message).slice(0, 1000))
      return reply.code(204).send()
    }
  )

  // DELETE /api/logs — clear in-memory log buffer
  app.delete('/', { preHandler: [requireAuth] }, async (_req, reply) => {
    clearLogs()
    return reply.code(204).send()
  })
}
