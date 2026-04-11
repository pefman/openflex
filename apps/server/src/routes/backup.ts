import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import fs from 'fs'
import { db } from '../db/client.js'
import { requireAuth } from '../lib/auth.js'

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'openflex.db')

export const backupRoutes: FastifyPluginAsync = async (app) => {
  // Download SQLite database file (admin only)
  // Bearer auth can't be used for direct downloads so we accept token as query param
  app.get<{ Querystring: { token?: string } }>('/db', async (req, reply) => {
    // Verify JWT from query string since this is a browser download
    const token = req.query.token
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })
    try {
      req.jwtVerify({ onlyCookie: false })
    } catch {
      try {
        await app.jwt.verify(token)
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    }

    if (!fs.existsSync(DB_PATH)) {
      return reply.code(404).send({ error: 'Database file not found' })
    }

    const filename = `openflex-backup-${new Date().toISOString().slice(0, 10)}.db`
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/octet-stream')
    return reply.send(fs.createReadStream(DB_PATH))
  })

  // Export settings as JSON
  app.get('/settings', { preHandler: [requireAuth] }, async (_req, reply) => {
    const settings = await db.setting.findMany()
    const obj: Record<string, string> = {}
    for (const s of settings) obj[s.key] = s.value

    const filename = `openflex-settings-${new Date().toISOString().slice(0, 10)}.json`
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/json')
    return reply.send(JSON.stringify(obj, null, 2))
  })

  // Import settings from JSON body
  app.post<{ Body: Record<string, string> }>('/settings', { preHandler: [requireAuth] }, async (req, reply) => {
    const body = req.body
    if (typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Invalid settings format — expected a JSON object' })
    }
    let count = 0
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue
      await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      count++
    }
    return reply.send({ imported: count })
  })
}
