import WebTorrent from 'webtorrent'
import path from 'path'
import { db } from '../db/client.js'
import { PATHS } from '../lib/dataDirs.js'
import { organizeCompletedDownload } from './organizer.js'
import { verifyVideoFile, probeFile } from './ffprobe.js'
import { log } from '../lib/logger.js'

let client: WebTorrent.Instance | null = null

function getClient(): WebTorrent.Instance {
  if (!client) {
    client = new WebTorrent()
    client.on('error', (err) => {
      log('error', 'torrent', `client error: ${err}`)
    })
  }
  return client
}

export async function addTorrent(
  magnetOrUrl: string,
  downloadId: number,
  savePath: string = PATHS.downloads
): Promise<void> {
  const wt = getClient()

  return new Promise((resolve, reject) => {
    wt.add(magnetOrUrl, { path: savePath }, async (torrent) => {
      const infoHash = torrent.infoHash

      // Update DB with infoHash
      await db.download.updateMany({
        where: { id: downloadId },
        data: { infoHash, size: torrent.length },
      }).catch(() => {})

      resolve()

      torrent.on('download', async () => {
        const progress = torrent.progress
        const speed = torrent.downloadSpeed
        const eta = torrent.timeRemaining ? Math.round(torrent.timeRemaining / 1000) : null
        const connections = torrent.numPeers ?? null

        await db.download.updateMany({
          where: { id: downloadId },
          data: { progress, speed, eta, status: 'downloading', connections },
        }).catch(() => {})
      })

      torrent.on('done', async () => {
        log('info', 'torrent', `download #${downloadId} complete: ${torrent.name}`)
        await db.download.updateMany({
          where: { id: downloadId },
          data: { progress: 1, speed: 0, eta: 0, status: 'importing' },
        }).catch(() => {})

        // Find the primary file (largest file)
        const files = torrent.files.sort((a, b) => b.length - a.length)
        const primaryFile = files[0]
        if (primaryFile) {
          const filePath = path.join(savePath, primaryFile.path)

          // Verify integrity before organizing
          log('info', 'torrent', `download #${downloadId}: found primary file ${primaryFile.name} (${(primaryFile.length / 1024 / 1024).toFixed(1)} MB), starting integrity check`)
          await db.download.updateMany({
            where: { id: downloadId },
            data: { status: 'verifying', progress: 0 },
          }).catch(() => {})
          try {
            await verifyVideoFile(filePath, async (pct) => {
              const r = await db.download.updateMany({ where: { id: downloadId }, data: { progress: pct } }).catch(() => ({ count: 0 }))
              if (r.count === 0) throw new Error('Download cancelled')
            })
            log('info', 'torrent', `download #${downloadId}: full-decode pass completed, probing streams`)
            // Ensure the file actually has a video stream
            const probe = await probeFile(filePath).catch(() => null)
            if (!probe?.codec || !probe?.resolution) {
              const detail = probe ? `codec=${probe.codec ?? 'none'} resolution=${probe.resolution ?? 'none'}` : 'probe failed'
              log('error', 'torrent', `download #${downloadId}: no video stream detected (${detail}) — file is corrupt or audio-only`)
              await db.download.updateMany({
                where: { id: downloadId },
                data: { status: 'failed', error: `No video stream found in file (${detail}). The file may be corrupt or audio-only.` },
              }).catch(() => {})
              import('./queue.js').then(({ processQueue }) => processQueue()).catch(() => {})
              return
            }

            log('info', 'torrent', `download #${downloadId}: verification passed — codec=${probe.codec} resolution=${probe.resolution} duration=${probe.duration ? Math.round(probe.duration) + 's' : 'unknown'}`)
            await db.download.updateMany({
              where: { id: downloadId },
              data: { status: 'importing', progress: 1 },
            }).catch(() => {})
          } catch (verifyErr) {
            log('error', 'torrent', `download #${downloadId}: integrity check failed: ${verifyErr}`)
            await db.download.updateMany({
              where: { id: downloadId },
              data: { status: 'failed', error: String(verifyErr) },
            }).catch(() => {})
            import('./queue.js').then(({ processQueue }) => processQueue()).catch(() => {})
            return
          }

          await organizeCompletedDownload(downloadId, filePath)
        }

        await db.download.updateMany({
          where: { id: downloadId },
          data: { status: 'completed' },
        }).catch(() => {})

        import('./queue.js').then(({ processQueue }) => processQueue()).catch(() => {})
      })

      torrent.on('error', async (err) => {
        log('error', 'torrent', `download #${downloadId} error: ${err}`)
        await db.download.updateMany({
          where: { id: downloadId },
          data: { status: 'failed', error: String(err) },
        }).catch(() => {})

        import('./queue.js').then(({ processQueue }) => processQueue()).catch(() => {})
      })
    })

    wt.once('error', reject)
  })
}

export async function pauseTorrent(infoHash: string): Promise<void> {
  const wt = getClient()
  const torrent = wt.get(infoHash)
  if (torrent) {
    torrent.pause()
    await db.download.updateMany({ where: { infoHash }, data: { status: 'paused' } })
  }
}

export async function resumeTorrent(infoHash: string): Promise<void> {
  const wt = getClient()
  const torrent = wt.get(infoHash)
  if (torrent) {
    torrent.resume()
    await db.download.updateMany({ where: { infoHash }, data: { status: 'downloading' } })
  }
}

export async function removeTorrent(infoHash: string): Promise<void> {
  const wt = getClient()
  const torrent = wt.get(infoHash)
  if (torrent) {
    await new Promise<void>((resolve) => torrent.destroy({}, resolve as any))
  }
}

// Restore active downloads on server restart
export async function restoreActiveTorrents(): Promise<void> {
  const active = await db.download.findMany({
    where: { type: 'torrent', status: { in: ['downloading', 'queued', 'paused'] }, infoHash: { not: null } },
  })
  for (const d of active) {
    if (d.infoHash) {
      addTorrent(d.infoHash, d.id, d.savePath ?? PATHS.downloads).catch(() => {})
    }
  }
}
