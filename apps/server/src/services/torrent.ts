import WebTorrent from 'webtorrent'
import path from 'path'
import { db } from '../db/client.js'
import { PATHS } from '../lib/dataDirs.js'
import { organizeCompletedDownload } from './organizer.js'
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
      await db.download.update({
        where: { id: downloadId },
        data: { infoHash, status: 'downloading', size: torrent.length },
      }).catch(() => {})

      resolve()

      torrent.on('download', async () => {
        const progress = torrent.progress
        const speed = torrent.downloadSpeed
        const eta = torrent.timeRemaining ? Math.round(torrent.timeRemaining / 1000) : null

        await db.download.update({
          where: { id: downloadId },
          data: { progress, speed, eta, status: 'downloading' },
        }).catch(() => {})
      })

      torrent.on('done', async () => {
        log('info', 'torrent', `download #${downloadId} complete: ${torrent.name}`)
        await db.download.update({
          where: { id: downloadId },
          data: { progress: 1, speed: 0, eta: 0, status: 'importing' },
        }).catch(() => {})

        // Find the primary file (largest file)
        const files = torrent.files.sort((a, b) => b.length - a.length)
        const primaryFile = files[0]
        if (primaryFile) {
          const filePath = path.join(savePath, primaryFile.path)
          await organizeCompletedDownload(downloadId, filePath)
        }

        await db.download.update({
          where: { id: downloadId },
          data: { status: 'completed' },
        }).catch(() => {})
      })

      torrent.on('error', async (err) => {
        log('error', 'torrent', `download #${downloadId} error: ${err}`)
        await db.download.update({
          where: { id: downloadId },
          data: { status: 'failed', error: String(err) },
        }).catch(() => {})
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
