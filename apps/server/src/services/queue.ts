import { db } from '../db/client.js'
import { log } from '../lib/logger.js'
import { PATHS } from '../lib/dataDirs.js'

let processing = false

/**
 * Starts the next queued download if nothing is currently active.
 * Safe to call concurrently — uses an in-memory lock plus a DB check.
 */
export async function processQueue(): Promise<void> {
  if (processing) return
  processing = true
  try {
    const activeCount = await db.download.count({
      where: { status: { in: ['downloading', 'importing'] } },
    })
    if (activeCount > 0) return

    const next = await db.download.findFirst({
      where: { status: 'queued', sourceUrl: { not: null } },
      orderBy: [{ queuePos: 'asc' }, { addedAt: 'asc' }],
    })
    if (!next) return

    log('info', 'queue', `starting download #${next.id}: ${next.title}`)

    // Pre-mark as downloading so concurrent processQueue calls see it
    await db.download.updateMany({
      where: { id: next.id },
      data: { status: 'downloading' },
    })

    // Dynamic imports break the potential circular dep chain
    const { addNzbDownload } = await import('./usenet.js')
    const { addTorrent } = await import('./torrent.js')

    if (next.type === 'usenet') {
      addNzbDownload(next.sourceUrl!, next.id, next.savePath ?? PATHS.downloads).catch((err) => {
        if (!String(err).includes('Download cancelled')) {
          log('error', 'queue', `#${next.id} usenet error: ${err}`)
        }
      })
    } else {
      addTorrent(next.sourceUrl!, next.id, next.savePath ?? PATHS.downloads).catch((err) => {
        if (!String(err).includes('Download cancelled')) {
          log('error', 'queue', `#${next.id} torrent error: ${err}`)
        }
      })
    }
  } finally {
    processing = false
  }
}
