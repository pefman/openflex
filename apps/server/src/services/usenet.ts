import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { createExtractorFromFile } from 'node-unrar-js'
import { db } from '../db/client.js'
import { NntpClient } from './nntp.js'
import { parseNzb } from './nzb.js'
import { yEncDecode } from './yenc.js'
import { organizeCompletedDownload } from './organizer.js'
import { log } from '../lib/logger.js'

async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'OpenFlex/1.0 (compatible; newznab)' } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

export async function addNzbDownload(
  nzbUrl: string,
  downloadId: number,
  savePath: string
): Promise<void> {
  // Fetch the NZB file
  const nzbXml = await fetchUrl(nzbUrl)
  const nzb = parseNzb(nzbXml)

  if (!nzb.files.length) {
    await db.download.update({ where: { id: downloadId }, data: { status: 'failed', error: 'Empty NZB file' } })
    return
  }

  // Get usenet server
  const servers = await db.usenetServer.findMany({ where: { enabled: true } })
  if (!servers.length) {
    await db.download.update({ where: { id: downloadId }, data: { status: 'failed', error: 'No usenet servers configured' } })
    return
  }

  const server = servers[0]

  // Filter to useful files only (skip .nfo, .jpg, .nzb, .srr, .sfv metadata)
  const SKIP_EXT = new Set(['.nfo', '.jpg', '.jpeg', '.png', '.nzb', '.srr', '.sfv', '.txt'])
  const downloadFiles = nzb.files.filter((f) => {
    const name = (extractFilename(f.subject) ?? '').toLowerCase()
    const ext = path.extname(name)
    return !SKIP_EXT.has(ext)
  })

  const totalBytes = downloadFiles.reduce((acc, f) => acc + f.bytes, 0)
  log('info', 'usenet', `download #${downloadId}: ${downloadFiles.length} file(s), ${(totalBytes / 1024 / 1024).toFixed(0)} MB total`)

  await db.download.update({
    where: { id: downloadId },
    data: { status: 'downloading', size: totalBytes || nzb.files.reduce((a, f) => a + f.bytes, 0) },
  })

  // Create a temp work directory for this download
  const workDir = path.join(savePath, `_openflex_${downloadId}`)
  await fs.promises.mkdir(workDir, { recursive: true })

  try {
    let downloaded = 0

    for (const file of downloadFiles) {
      const filename = extractFilename(file.subject) ?? `file_${downloadFiles.indexOf(file)}`
      const destPath = path.join(workDir, filename)
      log('info', 'usenet', `download #${downloadId}: downloading ${filename} (${(file.bytes / 1024 / 1024).toFixed(1)} MB)`)

      await downloadNzbFile(server, file, destPath, async (fileBytes) => {
        const progress = totalBytes > 0 ? Math.min((downloaded + fileBytes) / totalBytes, 0.99) : 0
        await db.download.update({
          where: { id: downloadId },
          data: { progress, status: 'downloading' },
        }).catch(() => {})
      })

      downloaded += file.bytes
    }

    await db.download.update({ where: { id: downloadId }, data: { status: 'importing', progress: 1 } })

    // Find a video file to organize — either direct or via RAR extraction
    const videoPath = await findOrExtractVideo(workDir, downloadId)
    if (videoPath) {
      await organizeCompletedDownload(downloadId, videoPath)
      await db.download.update({ where: { id: downloadId }, data: { status: 'completed' } })
    } else {
      log('warn', 'usenet', `download #${downloadId}: no video file found after extraction`)
      await db.download.update({ where: { id: downloadId }, data: { status: 'failed', error: 'No video file found after extraction' } })
    }
  } catch (err) {
    await db.download.update({
      where: { id: downloadId },
      data: { status: 'failed', error: String(err) },
    }).catch(() => {})
    throw err
  } finally {
    // Clean up work dir
    fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.webm'])

// Rename part files to strip leading zeros from the part number so libunrar can
// correctly resolve multi-volume archives regardless of how many digits NZBGeek used.
// e.g. file.part001.rar → file.part1.rar, file.part010.rar → file.part10.rar
async function normalizeRarPartNames(dir: string): Promise<void> {
  const files = await fs.promises.readdir(dir)
  for (const f of files) {
    const m = f.match(/^(.+\.part)0*(\d+\.rar)$/i)
    if (m) {
      const normalized = m[1] + m[2]
      if (normalized !== f) {
        await fs.promises.rename(path.join(dir, f), path.join(dir, normalized))
      }
    }
  }
}

async function findOrExtractVideo(dir: string, downloadId: number): Promise<string | null> {
  const files = await fs.promises.readdir(dir)

  // Check for a direct video file first
  for (const f of files) {
    if (VIDEO_EXTS.has(path.extname(f).toLowerCase())) {
      return path.join(dir, f)
    }
  }

  // Normalize part names before checking — strips leading zeros from part number
  await normalizeRarPartNames(dir)
  const normalizedFiles = await fs.promises.readdir(dir)

  // Look for RAR archives — find the first part (part1.rar or plain .rar)
  const rarFiles = normalizedFiles
    .filter((f) => /\.r(?:ar|\d+)$/i.test(f))
    .sort()

  if (!rarFiles.length) return null

  // Find the entry RAR: the one ending in part1.rar (any digit count), else first
  const entryRar = rarFiles.find((f) => /\.part1\.rar$/i.test(f)) ?? rarFiles[0]
  const entryPath = path.join(dir, entryRar)

  log('info', 'usenet', `download #${downloadId}: extracting ${entryRar}`)

  try {
    const extractor = await createExtractorFromFile({ filepath: entryPath, targetPath: dir })
    const extracted = extractor.extract()
    for (const file of extracted.files) {
      if (VIDEO_EXTS.has(path.extname(file.fileHeader.name).toLowerCase())) {
        return path.join(dir, file.fileHeader.name)
      }
    }
  } catch (err) {
    log('error', 'usenet', `download #${downloadId}: RAR extraction failed: ${err}`)
    throw new Error(`RAR extraction failed: ${err}`)
  }

  return null
}

async function downloadNzbFile(
  server: any,
  file: import('./nzb.js').NzbFile,
  destPath: string,
  onProgress: (bytes: number) => Promise<void>
): Promise<void> {
  const password = await getServerPassword(server.id)

  const client = new NntpClient({
    host: server.host,
    port: server.port,
    ssl: server.ssl,
    username: server.username,
    password,
  })

  await client.connect()

  const parts: Buffer[] = []
  let downloaded = 0

  const segments = file.segments.sort((a, b) => a.number - b.number)

  for (const segment of segments) {
    try {
      const raw = await client.getArticle(segment.messageId)
      const decoded = yEncDecode(raw)
      parts.push(decoded)
      downloaded += decoded.length
      await onProgress(downloaded)
    } catch (err) {
      log('warn', 'usenet', `failed segment ${segment.messageId}: ${err}`)
      // Continue with remaining segments
    }
  }

  client.close()

  const final = Buffer.concat(parts)
  await fs.promises.writeFile(destPath, final)
}

async function getServerPassword(serverId: number): Promise<string> {
  // passwordHash is stored hashed — in our case we store it as plain for now (NNTP needs plain)
  // In production this would use a proper secret storage mechanism
  const server = await db.usenetServer.findUnique({ where: { id: serverId } })
  if (!server) throw new Error('Server not found')
  // We store the password as-is (encrypted) - return directly
  return server.passwordHash
}

function extractFilename(subject: string): string | null {
  const match = subject.match(/"([^"]+)"/) ?? subject.match(/\[(\S+\.\w{2,4})\]/)
  return match?.[1] ?? null
}
