import fs from 'fs/promises'
import path from 'path'
import { db } from '../db/client.js'
import { PATHS } from '../lib/dataDirs.js'
import { probeFile } from './ffprobe.js'

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.webm'])

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim()
}

export async function organizeCompletedDownload(downloadId: number, filePath: string): Promise<void> {
  const download = await db.download.findUnique({ where: { id: downloadId } })
  if (!download) return

  const ext = path.extname(filePath).toLowerCase()
  if (!VIDEO_EXTENSIONS.has(ext)) return

  let destPath: string

  if (download.movieId) {
    const movie = await db.movie.findUnique({ where: { id: download.movieId } })
    if (!movie) return
    const folder = sanitizeFilename(`${movie.title}${movie.year ? ` (${movie.year})` : ''}`)
    const destDir = path.join(PATHS.movies, folder)
    await fs.mkdir(destDir, { recursive: true })
    destPath = path.join(destDir, `${folder}${ext}`)

    await moveFile(filePath, destPath)
    await scanIntoDb(destPath, download.movieId, null)
    await db.movie.update({ where: { id: download.movieId }, data: { status: 'downloaded' } })
  } else if (download.episodeId) {
    const episode = await db.episode.findUnique({
      where: { id: download.episodeId },
      include: { show: true, season: true },
    })
    if (!episode) return

    const showFolder = sanitizeFilename(episode.show.title)
    const seasonFolder = `Season ${String(episode.season.seasonNumber).padStart(2, '0')}`
    const episodeFile = sanitizeFilename(
      `${episode.show.title} - S${String(episode.season.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${episode.title ?? 'Episode ' + episode.episodeNumber}${ext}`
    )

    const destDir = path.join(PATHS.shows, showFolder, seasonFolder)
    await fs.mkdir(destDir, { recursive: true })
    destPath = path.join(destDir, episodeFile)

    await moveFile(filePath, destPath)
    await scanIntoDb(destPath, null, download.episodeId)
    await db.episode.update({ where: { id: download.episodeId }, data: { status: 'downloaded' } })
  }
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest)
  } catch {
    // Cross-device move
    await fs.copyFile(src, dest)
    await fs.unlink(src).catch(() => {})
  }
}

async function scanIntoDb(filePath: string, movieId: number | null, episodeId: number | null): Promise<void> {
  const probe = await probeFile(filePath).catch(() => null)
  const stat = await fs.stat(filePath).catch(() => null)

  const existing = await db.mediaFile.findUnique({ where: { path: filePath } })

  const data = {
    path: filePath,
    size: stat?.size ?? 0,
    codec: probe?.codec ?? null,
    resolution: probe?.resolution ?? null,
    container: probe?.container ?? null,
    duration: probe?.duration ?? null,
    movieId,
    episodeId,
  }

  if (existing) {
    await db.mediaFile.update({ where: { path: filePath }, data })
  } else {
    await db.mediaFile.create({ data })
  }
}

// Scan from filesystem into DB (for existing media)
export async function scanLibrary(): Promise<void> {
  await scanDir(PATHS.movies, 'movie')
  await scanDir(PATHS.shows, 'show')
}

async function scanDir(dir: string, type: 'movie' | 'show'): Promise<void> {
  let entries: string[]
  try {
    entries = await listFilesRecursively(dir)
  } catch {
    return
  }

  for (const filePath of entries) {
    const ext = path.extname(filePath).toLowerCase()
    if (!VIDEO_EXTENSIONS.has(ext)) continue

    const existing = await db.mediaFile.findUnique({ where: { path: filePath } })
    if (existing) continue

    await scanIntoDb(filePath, null, null)
  }
}

async function listFilesRecursively(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await listFilesRecursively(full))
    } else {
      result.push(full)
    }
  }
  return result
}
