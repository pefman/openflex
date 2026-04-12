import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import type { CreateQualityProfileRequest } from '@openflex/shared'

export const qualityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const profiles = await db.qualityProfile.findMany()
    return reply.send(profiles.map(mapProfile))
  })

  app.get<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const p = await db.qualityProfile.findUnique({ where: { id: Number(req.params.id) } })
    if (!p) return reply.code(404).send({ error: 'Not found' })
    return reply.send(mapProfile(p))
  })

  app.post<{ Body: CreateQualityProfileRequest }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { name, items, upgradeAllowed = true, minScore = 0 } = req.body
    const profile = await db.qualityProfile.create({
      data: { name, items: JSON.stringify(items), upgradeAllowed, minScore },
    })
    return reply.code(201).send(mapProfile(profile))
  })

  app.patch<{ Params: { id: string }; Body: Partial<CreateQualityProfileRequest> }>(
    '/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const { items, ...rest } = req.body
      const profile = await db.qualityProfile.update({
        where: { id: Number(req.params.id) },
        data: { ...rest, ...(items ? { items: JSON.stringify(items) } : {}) },
      })
      return reply.send(mapProfile(profile))
    }
  )

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    await db.qualityProfile.delete({ where: { id: Number(req.params.id) } })
    return reply.code(204).send()
  })
}

function mapProfile(p: any) {
  return { ...p, items: JSON.parse(p.items ?? '[]') }
}
