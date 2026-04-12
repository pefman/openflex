import cron from 'node-cron'
import { syncDueImdbSubscriptions } from './imdbLists.js'
import { log } from '../lib/logger.js'

const TICK_MINUTES = 15

let task: cron.ScheduledTask | null = null
let isRunning = false
let lastRun: Date | null = null

export function getImdbSyncJobStatus() {
  return {
    intervalMinutes: TICK_MINUTES,
    lastRun: lastRun?.toISOString() ?? null,
    running: isRunning,
  }
}

export function stopImdbSyncJob() {
  if (task) {
    task.stop()
    task = null
  }
}

export function startImdbSyncJob() {
  stopImdbSyncJob()
  const cronExpr = `*/${TICK_MINUTES} * * * *`

  task = cron.schedule(cronExpr, async () => {
    if (isRunning) return
    isRunning = true
    try {
      await syncDueImdbSubscriptions()
      lastRun = new Date()
    } catch (err) {
      log('error', 'imdb-sync', `job run failed: ${String(err)}`)
    } finally {
      isRunning = false
    }
  })

  log('info', 'imdb-sync', `started — interval: every ${TICK_MINUTES} min (${cronExpr})`)
}

export async function runImdbSyncNow() {
  if (isRunning) return
  isRunning = true
  try {
    await syncDueImdbSubscriptions()
    lastRun = new Date()
  } finally {
    isRunning = false
  }
}
