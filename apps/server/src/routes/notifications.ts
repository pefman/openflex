import type { FastifyPluginAsync } from 'fastify'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import { notify } from '../services/notifier.js'

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // List all endpoints
  app.get('/', { preHandler: [requireAuth] }, async (_req, reply) => {
    const endpoints = await db.notificationEndpoint.findMany({ orderBy: { id: 'asc' } })
    return reply.send(endpoints)
  })

  // Create endpoint
  app.post<{ Body: { name: string; type: string; url: string; token?: string; chatId?: string; enabled?: boolean; events?: string } }>(
    '/', { preHandler: [requireAuth] }, async (req, reply) => {
      const { name, type, url, token, chatId, enabled = true, events } = req.body
      if (!name || !type || !url) return reply.code(400).send({ error: 'name, type, and url are required' })
      const ep = await db.notificationEndpoint.create({
        data: { name, type, url, token: token ?? null, chatId: chatId ?? null, enabled, events: events ?? '["grab","complete","failed"]' },
      })
      return reply.code(201).send(ep)
    }
  )

  // Update endpoint
  app.patch<{ Params: { id: string }; Body: Partial<{ name: string; type: string; url: string; token: string | null; chatId: string | null; enabled: boolean; events: string }> }>(
    '/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const id = parseInt(req.params.id)
      const ep = await db.notificationEndpoint.update({ where: { id }, data: req.body })
      return reply.send(ep)
    }
  )

  // Delete endpoint
  app.delete<{ Params: { id: string } }>(
    '/:id', { preHandler: [requireAuth] }, async (req, reply) => {
      const id = parseInt(req.params.id)
      await db.notificationEndpoint.delete({ where: { id } })
      return reply.send({ success: true })
    }
  )

  // Test endpoint — sends a test notification
  app.post<{ Params: { id: string } }>(
    '/:id/test', { preHandler: [requireAuth] }, async (req, reply) => {
      const id = parseInt(req.params.id)
      const ep = await db.notificationEndpoint.findUnique({ where: { id } })
      if (!ep) return reply.code(404).send({ error: 'Not found' })

      try {
        await notify('complete', 'OpenFlex test notification', 'This is a test from OpenFlex')
        return reply.send({ ok: true })
      } catch (err) {
        return reply.code(500).send({ error: String(err) })
      }
    }
  )
}
