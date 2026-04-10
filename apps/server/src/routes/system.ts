import fs from 'fs'
import net from 'net'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../lib/auth.js'
import { PATHS } from '../lib/dataDirs.js'
import { db } from '../db/client.js'
import { getSchedulerStatus } from '../services/scheduler.js'
import { getHwEncoder } from '../services/hls.js'

function checkTcpConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 3000)
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.once('error', () => { clearTimeout(timer); resolve(false) })
  })
}

async function getDiskStats() {
  try {
    const stats = await fs.promises.statfs(PATHS.downloads)
    const total = stats.blocks * stats.bsize
    const free = stats.bfree * stats.bsize
    const used = total - free
    return { total, free, used, path: PATHS.downloads }
  } catch {
    return null
  }
}

export async function systemRoutes(app: FastifyInstance) {
  // GET /api/system/version
  app.get('/version', async (_req, reply) => {
    return reply.send({ version: process.env.npm_package_version ?? '0.2.0' })
  })

  // GET /api/system/disk
  app.get('/disk', { preHandler: [requireAuth] }, async (req, reply) => {
    const disk = await getDiskStats()
    if (!disk) return reply.code(500).send({ error: 'Unable to read disk stats' })
    return reply.send(disk)
  })

  // GET /api/system/health
  app.get('/health', { preHandler: [requireAuth] }, async (req, reply) => {
    const [disk, indexers, usenetServers] = await Promise.all([
      getDiskStats(),
      db.indexer.findMany({ orderBy: { priority: 'asc' } }),
      db.usenetServer.findMany(),
    ])

    const usenetWithStatus = await Promise.all(
      usenetServers.map(async (s) => ({
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port,
        ssl: s.ssl,
        enabled: s.enabled,
        online: s.enabled ? await checkTcpConnection(s.host, s.port) : false,
      }))
    )

    return reply.send({
      disk,
      scheduler: getSchedulerStatus(),
      indexers: indexers.map((i) => ({ id: i.id, name: i.name, type: i.type, enabled: i.enabled, priority: i.priority })),
      usenetServers: usenetWithStatus,
      transcoding: {
        hwEncoder: getHwEncoder(),
        nvenc: getHwEncoder() === 'nvenc',
        qsv: getHwEncoder() === 'qsv',
        vaapi: getHwEncoder() === 'vaapi',
      },
    })
  })
}
