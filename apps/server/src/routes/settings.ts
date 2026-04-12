import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const settings = await db.setting.findMany()
    const obj: Record<string, string> = {}
    for (const s of settings) obj[s.key] = s.value
    return reply.send(obj)
  })

  app.put<{ Body: Record<string, string> }>('/', { preHandler: [requireAuth] }, async (req, reply) => {
    for (const [key, value] of Object.entries(req.body)) {
      await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    }
    return reply.send({ success: true })
  })
}
