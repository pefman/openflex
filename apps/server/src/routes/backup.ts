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
    // Verify JWT from query string since this is a browser download (no Authorization header)
    const token = req.query.token
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })
    try {
      await app.jwt.verify(token)
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    if (!fs.existsSync(DB_PATH)) {
      return reply.code(404).send({ error: 'Database file not found' })
    }

    const filename = `openflex-backup-${new Date().toISOString().slice(0, 10)}.db`
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/octet-stream')
    return reply.send(fs.createReadStream(DB_PATH))
  })

  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
  const unb64 = (s: string) => Buffer.from(s, 'base64').toString('utf8')
  // Fields that are obfuscated as base64 in the export
  const OBFUSCATED_FIELDS = ['apiKey', 'passwordHash', 'token']
  const obfuscate = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...obj }
    for (const f of OBFUSCATED_FIELDS) if (typeof out[f] === 'string' && out[f]) out[f] = b64(out[f] as string)
    return out
  }
  const deobfuscate = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...obj }
    for (const f of OBFUSCATED_FIELDS) {
      if (typeof out[f] === 'string' && out[f]) {
        try { out[f] = unb64(out[f] as string) } catch { /* leave as-is if not valid base64 */ }
      }
    }
    return out
  }

  // Export all configuration as JSON (settings kv, indexers, usenet servers, notification endpoints)
  app.get('/settings', { preHandler: [requireAuth] }, async (_req, reply) => {
    const [settings, indexers, usenetServers, notifications] = await Promise.all([
      db.setting.findMany(),
      db.indexer.findMany(),
      db.usenetServer.findMany(),
      db.notificationEndpoint.findMany(),
    ])
    const settingsObj: Record<string, string> = {}
    for (const s of settings) settingsObj[s.key] = s.value

    const payload = {
      _v: 2,
      settings: settingsObj,
      indexers: indexers.map(({ id: _id, grabCount: _g, ...rest }) => obfuscate(rest)),
      usenetServers: usenetServers.map(({ id: _id, ...rest }) => obfuscate(rest)),
      notifications: notifications.map(({ id: _id, ...rest }) => obfuscate(rest)),
    }

    const filename = `openflex-config-${new Date().toISOString().slice(0, 10)}.json`
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    reply.header('Content-Type', 'application/json')
    return reply.send(JSON.stringify(payload, null, 2))
  })

  // Import configuration from JSON body
  app.post<{ Body: {
    _v?: number
    settings?: Record<string, string>
    indexers?: Array<Record<string, unknown>>
    usenetServers?: Array<Record<string, unknown>>
    notifications?: Array<Record<string, unknown>>
  } }>('/settings', { preHandler: [requireAuth] }, async (req, reply) => {
    const body = req.body
    if (typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'Invalid config format' })
    }

    // Support both old format (flat kv object) and new format ({settings:{}, indexers:[], ...})
    const isV2 = (body as any)._v === 2
    const settingsObj: Record<string, string> = body.settings
      ? (body.settings as unknown as Record<string, string>)
      : Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== '_v' && typeof v === 'string')) as unknown as Record<string, string>

    for (const [key, value] of Object.entries(settingsObj)) {
      if (typeof value !== 'string') continue
      await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    }

    if (Array.isArray(body.indexers)) {
      for (const idx of body.indexers) {
        await db.indexer.create({ data: (isV2 ? deobfuscate(idx) : idx) as any })
      }
    }

    if (Array.isArray(body.usenetServers)) {
      for (const srv of body.usenetServers) {
        await db.usenetServer.create({ data: (isV2 ? deobfuscate(srv) : srv) as any })
      }
    }

    if (Array.isArray(body.notifications)) {
      for (const n of body.notifications) {
        await db.notificationEndpoint.create({ data: (isV2 ? deobfuscate(n) : n) as any })
      }
    }

    return reply.send({ success: true })
  })
}
