import cron from 'node-cron'
import fs from 'fs/promises'
import path from 'path'
import { db } from '../db/client.js'
import { PATHS } from '../lib/dataDirs.js'
import { log } from '../lib/logger.js'

const DEFAULT_INTERVAL_HOURS = 24
const SETTING_ENABLED = 'CLEANUP_ENABLED'
const SETTING_INTERVAL = 'CLEANUP_INTERVAL_HOURS'

let task: cron.ScheduledTask | null = null
let isRunning = false
let lastRun: Date | null = null
let currentIntervalHours = DEFAULT_INTERVAL_HOURS
let currentEnabled = true

export function getCleanupJobStatus() {
  return {
    enabled: currentEnabled,
    intervalHours: currentIntervalHours,
    lastRun: lastRun?.toISOString() ?? null,
    running: isRunning,
  }
}

async function getSettings(): Promise<{ enabled: boolean; intervalHours: number }> {
  const [enabledRow, intervalRow] = await Promise.all([
    db.setting.findUnique({ where: { key: SETTING_ENABLED } }),
    db.setting.findUnique({ where: { key: SETTING_INTERVAL } }),
  ])
  const enabled = enabledRow ? enabledRow.value !== 'false' : true
  const intervalHours = intervalRow ? Math.max(1, Number(intervalRow.value) || DEFAULT_INTERVAL_HOURS) : DEFAULT_INTERVAL_HOURS
  return { enabled, intervalHours }
}

export async function startCleanupJob() {
  stopCleanupJob()

  const { enabled, intervalHours } = await getSettings()
  currentEnabled = enabled
  currentIntervalHours = intervalHours

  if (!enabled) {
    log('info', 'cleanup', 'cleanup job disabled — skipping')
    return
  }

  // Cron: run every N hours at minute 0
  const cronExpr = `0 */${intervalHours} * * *`

  task = cron.schedule(cronExpr, async () => {
    await runCleanupNow()
  })

  log('info', 'cleanup', `started — interval: every ${intervalHours}h (${cronExpr})`)
}

export function stopCleanupJob() {
  if (task) {
    task.stop()
    task = null
  }
}

export async function runCleanupNow(): Promise<{ deleted: string[]; skipped: boolean }> {
  if (isRunning) {
    log('warn', 'cleanup', 'skipping — already running')
    return { deleted: [], skipped: true }
  }

  isRunning = true
  log('info', 'cleanup', 'starting downloads folder cleanup')

  try {
    // Check for active or in-progress downloads — bail out if any
    const activeCount = await db.download.count({
      where: { status: { in: ['downloading', 'importing'] } },
    })

    if (activeCount > 0) {
      log('info', 'cleanup', `skipping — ${activeCount} active download(s) in progress`)
      return { deleted: [], skipped: true }
    }

    const deleted: string[] = []
    let entries: import('fs').Dirent<string>[]

    try {
      entries = await fs.readdir(PATHS.downloads, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      log('warn', 'cleanup', 'downloads folder not found or unreadable')
      return { deleted: [], skipped: false }
    }

    for (const entry of entries) {
      const fullPath = path.join(PATHS.downloads, entry.name)

      if (entry.isDirectory()) {
        // Always remove our own temp dirs; remove other dirs only if empty
        if (entry.name.startsWith('_openflex_')) {
          await fs.rm(fullPath, { recursive: true, force: true })
          deleted.push(entry.name)
          log('info', 'cleanup', `removed temp dir: ${entry.name}`)
        } else {
          const children = await fs.readdir(fullPath).catch(() => null)
          if (children?.length === 0) {
            await fs.rmdir(fullPath)
            deleted.push(entry.name)
            log('info', 'cleanup', `removed empty dir: ${entry.name}`)
          }
        }
      } else if (entry.isFile()) {
        // activeCount === 0 at this point, so any loose file in the downloads
        // root is an orphan (old broken run, stale part file, etc.) — safe to remove
        await fs.unlink(fullPath)
        deleted.push(entry.name)
        log('info', 'cleanup', `removed orphaned file: ${entry.name}`)
      }
    }

    log('info', 'cleanup', `done — removed ${deleted.length} item(s)`)
    return { deleted, skipped: false }
  } catch (err) {
    log('error', 'cleanup', String(err))
    throw err
  } finally {
    lastRun = new Date()
    isRunning = false
  }
}
