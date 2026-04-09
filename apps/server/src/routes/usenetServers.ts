import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import type { CreateUsenetServerRequest } from '@openflex/shared'

export const usenetServerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const servers = await db.usenetServer.findMany()
    return reply.send(servers.map(({ passwordHash: _, ...s }) => s))
  })

  app.post<{ Body: CreateUsenetServerRequest }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const { name, host, port, ssl, username, password, maxConnections } = req.body
    const server = await db.usenetServer.create({
      data: { name, host, port, ssl, username, passwordHash: password, maxConnections },
    })
    const { passwordHash: _, ...safe } = server
    return reply.code(201).send(safe)
  })

  app.patch<{ Params: { id: string }; Body: Partial<CreateUsenetServerRequest> }>(
    '/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const { password, ...rest } = req.body
      const server = await db.usenetServer.update({
        where: { id: Number(req.params.id) },
        data: { ...rest, ...(password ? { passwordHash: password } : {}) },
      })
      const { passwordHash: _, ...safe } = server
      return reply.send(safe)
    }
  )

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    await db.usenetServer.delete({ where: { id: Number(req.params.id) } })
    return reply.code(204).send()
  })
}
