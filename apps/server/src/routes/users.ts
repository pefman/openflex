import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { requireAuth, getUser } from '../lib/auth.js'

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/users — admin only
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const caller = getUser(req)
    if (caller.role !== 'admin') return reply.code(403).send({ error: 'Admin only' })
    const users = await db.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(users)
  })

  // PATCH /api/users/:id — change password (self or admin changes others)
  app.patch<{ Params: { id: string }; Body: { password: string; currentPassword?: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const caller = getUser(req)
      const targetId = Number(req.params.id)

      if (caller.id !== targetId && caller.role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden' })
      }

      const { password, currentPassword } = req.body
      if (!password || password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' })
      }

      const user = await db.user.findUnique({ where: { id: targetId } })
      if (!user) return reply.code(404).send({ error: 'Not found' })

      // Non-admin changing own password must provide current password
      if (caller.id === targetId && caller.role !== 'admin') {
        if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
          return reply.code(401).send({ error: 'Current password is incorrect' })
        }
      }

      const passwordHash = await bcrypt.hash(password, 12)
      await db.user.update({ where: { id: targetId }, data: { passwordHash } })
      return reply.send({ success: true })
    },
  )

  // DELETE /api/users/:id — admin only, cannot delete self
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const caller = getUser(req)
    if (caller.role !== 'admin') return reply.code(403).send({ error: 'Admin only' })
    const targetId = Number(req.params.id)
    if (caller.id === targetId) return reply.code(400).send({ error: 'Cannot delete your own account' })
    await db.user.delete({ where: { id: targetId } })
    return reply.code(204).send()
  })
}
