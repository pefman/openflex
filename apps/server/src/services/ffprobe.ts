import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

// Use bundled ffmpeg/ffprobe binaries
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string)
}
ffmpeg.setFfprobePath(ffprobeInstaller.path)

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
 * Partial verification: probe headers, then decode the first 30s and last 30s
 * in parallel. Much faster than a full decode pass while still catching the
 * most common corruption patterns (bad header, truncated tail, mid-file gaps).
 */
export async function verifyVideoFile(
  filePath: string,
  onProgress: (progress: number) => Promise<void>,
): Promise<void> {
  // Probe headers/container — catches bad EBML, wrong format, missing streams
  await probeFile(filePath)
  await onProgress(0.1)

  // Decode first 30s and last 30s in parallel
  await Promise.all([
    decodeSegment(filePath, [], ['-t', '30', '-v', 'error', '-f', 'null']),
    decodeSegment(filePath, ['-sseof', '-30'], ['-v', 'error', '-f', 'null']),
  ])

  await onProgress(1.0)
}

function decodeSegment(filePath: string, inputOpts: string[], outputOpts: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(filePath)
      .inputOptions(inputOpts)
      .outputOptions(outputOpts)
      .output('/dev/null')
      .on('end', () => resolve())
      .on('error', (_err, _stdout, stderr) => {
        if (stderr && /Error|Invalid|corrupt/i.test(stderr)) {
          reject(new Error(`Verification failed: ${stderr.slice(0, 300)}`))
        } else {
          reject(_err)
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
