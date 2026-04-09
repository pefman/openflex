import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../lib/auth.js'
import { getLogs, clearLogs } from '../lib/logger.js'

export async function logRoutes(app: FastifyInstance) {
  // GET /api/logs?limit=200
  app.get<{ Querystring: { limit?: string } }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const limit = Math.min(Number(req.query.limit ?? 200), 500)
    return reply.send(getLogs(limit))
  })

  // DELETE /api/logs — clear in-memory log buffer
  app.delete('/', { preHandler: [requireAuth] }, async (_req, reply) => {
    clearLogs()
    return reply.code(204).send()
  })
}
