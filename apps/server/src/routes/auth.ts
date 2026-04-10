import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'
import type { LoginRequest, RegisterRequest } from '@openflex/shared'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/register
  app.post<{ Body: RegisterRequest }>('/register', async (req, reply) => {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return reply.code(400).send({ error: 'email, password and name are required' })
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) return reply.code(409).send({ error: 'Email already registered' })

    const userCount = await db.user.count()
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: userCount === 0 ? 'admin' : 'user',
      },
    })

    const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role })
    return reply.code(201).send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  })

  // POST /auth/login
  app.post<{ Body: LoginRequest }>('/login', async (req, reply) => {
    const { email, password } = req.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password are required' })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role })
    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  })

  // GET /auth/me
  app.get('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    const payload = req.user as { id: number; email: string; role: string }
    const user = await db.user.findUnique({ where: { id: payload.id } })
    if (!user) return reply.code(404).send({ error: 'Not found' })
    return reply.send({ id: user.id, email: user.email, name: user.name, role: user.role })
  })
}
