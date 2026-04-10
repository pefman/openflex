import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildServer } from './app.js'
import { db } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { ensureDataDirs } from './lib/dataDirs.js'
import { startScheduler } from './services/scheduler.js'
import { startCleanupJob } from './services/cleanupJob.js'
import { processQueue } from './services/queue.js'
import { log } from './lib/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT ?? 7878)
const HOST = process.env.HOST ?? '0.0.0.0'

async function seedIndexers() {
  const count = await db.indexer.count()
  if (count > 0) return
  await db.indexer.create({
    data: {
      name: 'NZBGeek',
      type: 'newznab',
      url: 'https://api.nzbgeek.info',
      apiKey: 'PX6v7qlzDZyBZpyVGoXAvla94Tm1x1fM',
      enabled: true,
      priority: 0,
    },
  })
  log('info', 'startup', 'seeded NZBGeek indexer')
}

async function cleanupDownloads() {
  const { PATHS } = await import('./lib/dataDirs.js')
  const fs = await import('fs/promises')

  // Reset any downloads that were stuck mid-flight when the server last stopped
  const stuck = await db.download.updateMany({
    where: { status: { in: ['downloading', 'importing'] } },
    data: { status: 'failed', error: 'Interrupted by server restart', progress: 0 },
  })
  if (stuck.count > 0) log('warn', 'startup', `reset ${stuck.count} interrupted download(s) to failed`)

  // Delete orphaned temp dirs (_openflex_<id>) left by crashed downloads
  try {
    const entries = await fs.readdir(PATHS.downloads, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('_openflex_')) {
        await fs.rm(path.join(PATHS.downloads, entry.name), { recursive: true, force: true })
        log('info', 'startup', `cleaned orphaned temp dir: ${entry.name}`)
      }
    }
  } catch {
    // downloads dir may not exist yet — ensureDataDirs will create it
  }
}

async function main() {
  await ensureDataDirs()
  await runMigrations()
  await seedIndexers()
  await cleanupDownloads()

  const app = await buildServer()

  try {
    await app.listen({ port: PORT, host: HOST })
    console.log(`OpenFlex running on http://${HOST}:${PORT}`)
    await startScheduler()
    await startCleanupJob()
    // Resume any downloads that were queued before the server restarted
    processQueue().catch((err) => log('warn', 'startup', `queue resume error: ${err}`))
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
