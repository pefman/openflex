import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { testIndexer } from '../services/indexer.js'
import type { CreateIndexerRequest } from '@openflex/shared'

export const indexerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const indexers = await db.indexer.findMany({ orderBy: { priority: 'asc' } })
    return reply.send(indexers)
  })

  app.post<{ Body: CreateIndexerRequest }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { name, type, url, apiKey, enabled = true, priority = 0 } = req.body
    const indexer = await db.indexer.create({ data: { name, type, url, apiKey, enabled, priority } })
    return reply.code(201).send(indexer)
  })

  app.patch<{ Params: { id: string }; Body: Partial<CreateIndexerRequest> }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const indexer = await db.indexer.update({ where: { id: Number(req.params.id) }, data: req.body })
      return reply.send(indexer)
    }
  )

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    await db.indexer.delete({ where: { id: Number(req.params.id) } })
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/:id/test', { preHandler: [requireAuth] }, async (req, reply) => {
    const indexer = await db.indexer.findUnique({ where: { id: Number(req.params.id) } })
    if (!indexer) return reply.code(404).send({ error: 'Not found' })
    const ok = await testIndexer(indexer.url, indexer.apiKey)
    return reply.send({ success: ok })
  })
}
