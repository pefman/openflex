import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'

// Use bundled ffmpeg binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string)
}

interface ProbeResult {
  codec: string | null
  resolution: string | null
  container: string | null
  duration: number | null
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      const format = metadata.format

      const codec = videoStream?.codec_name ?? null
      const width = videoStream?.width
      const height = videoStream?.height
      const resolution = width && height ? `${width}x${height}` : null
      const container = format?.format_name?.split(',')[0] ?? null
      const duration = format?.duration ? Number(format.duration) : null

      resolve({ codec, resolution, container, duration })
    })
  })
}

/**
 * Full decode-pass verification using ffmpeg. Reads and decodes every frame
 * to detect corruption. Progress (0–1) is reported via onProgress callback.
 * Throws if ffmpeg exits with errors or finds a broken stream.
 */
export async function verifyVideoFile(
  filePath: string,
  onProgress: (progress: number) => Promise<void>,
): Promise<void> {
  // Get duration first so we can calculate progress
  const probe = await probeFile(filePath).catch(() => null)
  const totalSeconds = probe?.duration ?? 0

  return new Promise((resolve, reject) => {
    let lastPct = 0
    const cmd = ffmpeg(filePath)
      .outputOptions(['-v', 'error', '-f', 'null'])
      .output('/dev/null')
      .on('progress', (info) => {
        if (totalSeconds > 0 && info.timemark) {
          const parts = info.timemark.split(':').map(Number)
          const secs = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
          const pct = Math.min(secs / totalSeconds, 0.99)
          if (pct > lastPct + 0.01) {
            lastPct = pct
            onProgress(pct).catch(() => cmd.kill('SIGKILL'))
          }
        } else if (info.percent != null) {
          const pct = Math.min(info.percent / 100, 0.99)
          if (pct > lastPct + 0.01) {
            lastPct = pct
            onProgress(pct).catch(() => cmd.kill('SIGKILL'))
          }
        }
      })
      .on('end', () => resolve())
      .on('error', (err, _stdout, stderr) => {
        // ffmpeg exits with code 1 and prints errors to stderr on corruption
        if (stderr && /Error|Invalid|corrupt/i.test(stderr)) {
          reject(new Error(`Verification failed: ${stderr.slice(0, 300)}`))
        } else {
          reject(err)
        }
      })
    cmd.run()
  })
}

export async function extractSubtitles(filePath: string, outputDir: string): Promise<string[]> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve([])

      const subtitleStreams = metadata.streams.filter((s) => s.codec_type === 'subtitle')
      if (!subtitleStreams.length) return resolve([])

      const outputPaths: string[] = []
      const promises = subtitleStreams.map((stream, i) => {
        const lang = (stream.tags as any)?.language ?? `sub${i}`
        const outPath = `${outputDir}/${lang}_${i}.vtt`
        outputPaths.push(outPath)

        return new Promise<void>((res) => {
          ffmpeg(filePath)
            .outputOptions([`-map 0:s:${i}`, '-f webvtt'])
            .output(outPath)
            .on('end', () => res())
            .on('error', () => res())
            .run()
        })
      })

      Promise.all(promises)
        .then(() => resolve(outputPaths))
        .catch(() => resolve([]))
    })
  })
}
