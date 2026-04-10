/**
 * Downloads a static ffmpeg build with NVENC/QSV/VAAPI support from
 * BtbN's FFmpeg-Builds (https://github.com/BtbN/FFmpeg-Builds).
 *
 * The binary is placed at bin/ffmpeg (and bin/ffprobe) in the workspace root.
 * Skipped if the binary already exists and is executable.
 * Skipped on non-Linux platforms (macOS users must install ffmpeg manually).
 */

import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import { Extract } from 'tar'
import { fileURLToPath } from 'url'
import path from 'path'
import https from 'https'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BIN_DIR = path.join(ROOT, 'bin')
const FFMPEG_BIN = path.join(BIN_DIR, 'ffmpeg')
const FFPROBE_BIN = path.join(BIN_DIR, 'ffprobe')

// BtbN GPL static build — includes h264_nvenc, h264_qsv, h264_vaapi, libx264
const DOWNLOAD_URL =
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz'

if (process.platform !== 'linux') {
  console.log('[ffmpeg] Skipping download on non-Linux platform. Install ffmpeg manually.')
  process.exit(0)
}

if (existsSync(FFMPEG_BIN)) {
  console.log('[ffmpeg] Already present at bin/ffmpeg — skipping download.')
  process.exit(0)
}

mkdirSync(BIN_DIR, { recursive: true })

console.log('[ffmpeg] Downloading NVENC-capable static build...')
console.log(`[ffmpeg] Source: ${DOWNLOAD_URL}`)

const TMP_XZ = path.join(BIN_DIR, '_ffmpeg.tar.xz')

async function download(url, dest, redirects = 0) {
  if (redirects > 5) throw new Error('Too many redirects')
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'openflex-installer' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        return download(res.headers.location, dest, redirects + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      const ws = createWriteStream(dest)
      res.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    }).on('error', reject)
  })
}

try {
  await download(DOWNLOAD_URL, TMP_XZ)
  console.log('[ffmpeg] Extracting...')

  // xz decompression requires the xz-utils system package OR we can use the
  // lzma-native npm package. Since we can't guarantee system xz in all envs,
  // we use Node's child_process to call xz if available, otherwise inform user.
  import('child_process').then(({ execFileSync }) => {
    try {
      // Try system xz first
      execFileSync('xz', ['--version'], { stdio: 'ignore' })
      execFileSync('tar', ['-xJf', TMP_XZ, '--strip-components=2',
        '--wildcards', '*/bin/ffmpeg', '*/bin/ffprobe', '-C', BIN_DIR], { stdio: 'inherit' })
    } catch {
      // Fall back: try tar with auto-decompression (GNU tar handles .xz natively)
      execFileSync('tar', ['-xf', TMP_XZ, '--strip-components=2',
        '--wildcards', '*/bin/ffmpeg', '*/bin/ffprobe', '-C', BIN_DIR], { stdio: 'inherit' })
    }

    if (existsSync(FFMPEG_BIN)) {
      chmodSync(FFMPEG_BIN, 0o755)
      console.log('[ffmpeg] ✓ bin/ffmpeg ready')
    } else {
      console.warn('[ffmpeg] Warning: extraction completed but bin/ffmpeg not found')
    }
    if (existsSync(FFPROBE_BIN)) {
      chmodSync(FFPROBE_BIN, 0o755)
      console.log('[ffprobe] ✓ bin/ffprobe ready')
    }

    try { unlinkSync(TMP_XZ) } catch {}
  })
} catch (e) {
  console.warn(`[ffmpeg] Download/extract failed: ${e.message}`)
  console.warn('[ffmpeg] Falling back to bundled ffmpeg-static (no NVENC support)')
  try { unlinkSync(TMP_XZ) } catch {}
  // Non-fatal — the app will use ffmpeg-static as fallback
  process.exit(0)
}
